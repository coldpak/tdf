use crate::state::{League, Participant, Position};
use crate::utils::{
    calculate_notional, calculate_price_from_notional_and_size, calculate_unrealized_pnl,
    get_price_from_oracle,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct RefreshParticipant<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
      mut,
      seeds = [b"participant", league.key().as_ref(), user.key().as_ref()],
      bump = participant.bump
    )]
    pub participant: Account<'info, Participant>,

    /// CHECK: This account is validated by the participant account's user field
    pub user: AccountInfo<'info>,
    pub league: Account<'info, League>,
    // remaining accounts = [position_index_0, oracle_0, position_index_1, oracle_1, ...]
}

pub fn refresh_participant<'info>(
    ctx: Context<'_, '_, 'info, 'info, RefreshParticipant<'info>>,
) -> Result<()> {
    let participant = &mut ctx.accounts.participant;
    let remaining: &[AccountInfo<'info>] = ctx.remaining_accounts;
    let position_keys = &participant.positions.clone();

    require!(
        remaining.len() == position_keys.len() * 2,
        crate::errors::ErrorCode::InvalidRefreshAccounts
    );

    let mut total_upnl: i64 = 0;
    let mut total_used_margin: i64 = 0;
    let mut prices: Vec<i64> = Vec::new();

    for (i, position_key) in position_keys.iter().enumerate() {
        let position_ai = &remaining[i * 2];
        let oracle_ai = &remaining[i * 2 + 1];

        require_keys_eq!(
            *position_key,
            position_ai.key(),
            crate::errors::ErrorCode::PositionMismatch
        );

        let mut data = position_ai.try_borrow_mut_data()?;
        let mut position: Position = Position::try_deserialize(&mut &data[..])?;

        // if position is closed, skip
        if position.size == 0 {
            prices.push(0); // placeholder for closed positions
            continue;
        }

        require_keys_eq!(
            position.oracle_feed,
            oracle_ai.key(),
            crate::errors::ErrorCode::OracleMismatch
        );

        let price = get_price_from_oracle(&oracle_ai)?;
        prices.push(price);

        let new_upnl = calculate_unrealized_pnl(
            position.notional,
            price,
            position.size,
            position.market_decimals,
            position.direction.clone(),
        );

        position.unrealized_pnl = new_upnl;

        let mut dst = &mut data[..];
        position.try_serialize(&mut dst)?;

        total_upnl = total_upnl
            .checked_add(new_upnl)
            .ok_or(crate::errors::ErrorCode::MathOverflow)?;

        let margin_for_pos = position
            .notional
            .checked_div(position.leverage as i64)
            .ok_or(crate::errors::ErrorCode::MathOverflow)?;
        total_used_margin = total_used_margin
            .checked_add(margin_for_pos)
            .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    }

    participant.unrealized_pnl = total_upnl;
    participant.used_margin = total_used_margin;

    msg!(
        "Participant updated: unrealized_pnl: {}, used_margin: {}, equity: {}",
        total_upnl,
        total_used_margin,
        participant.equity()
    );

    if participant.equity() < 0 {
        msg!("💥 Auto liquidation triggered");
        for (i, position_key) in position_keys.iter().enumerate() {
            let position_ai = &remaining[i * 2];

            let mut data = position_ai.try_borrow_mut_data()?;
            let mut position: Position = Position::try_deserialize(&mut &data[..])?;

            if position.size == 0 {
                continue;
            }

            let price = prices[i];
            let realized_pnl = position.unrealized_pnl;
            let released_margin = position
                .notional
                .checked_div(position.leverage as i64)
                .ok_or(crate::errors::ErrorCode::MathOverflow)?;
            let closing_equity = calculate_notional(price, position.size, position.market_decimals);

            // Calculate closed stats with overflow protection
            position.closed_size = position
                .closed_size
                .checked_add(position.size)
                .ok_or(crate::errors::ErrorCode::MathOverflow)?;

            position.closed_equity = position
                .closed_equity
                .checked_add(closing_equity)
                .ok_or(crate::errors::ErrorCode::MathOverflow)?;

            // Safe division for closed_price
            if position.closed_size > 0 {
                position.closed_price = calculate_price_from_notional_and_size(
                    position.closed_equity,
                    position.closed_size,
                    position.market_decimals,
                );
            }

            position.closed_pnl = position
                .closed_pnl
                .checked_add(realized_pnl)
                .ok_or(crate::errors::ErrorCode::MathOverflow)?;

            // Update position
            position.size = 0;
            position.notional = 0;
            position.unrealized_pnl = 0;
            position.closed_at = Clock::get()?.unix_timestamp;

            // Update participant with overflow protection
            participant.total_volume = participant
                .total_volume
                .checked_add(closing_equity)
                .ok_or(crate::errors::ErrorCode::MathOverflow)?;

            participant.used_margin = participant
                .used_margin
                .checked_sub(released_margin)
                .ok_or(crate::errors::ErrorCode::MathOverflow)?;

            participant.virtual_balance = participant
                .virtual_balance
                .checked_add(realized_pnl)
                .ok_or(crate::errors::ErrorCode::MathOverflow)?;

            msg!(
                "Position liquidated: {} (realized_pnl: {}, released_margin: {})",
                position_key,
                realized_pnl,
                released_margin
            );

            let mut dst = &mut data[..];
            position.try_serialize(&mut dst)?;
        }

        // Clear all positions after liquidation
        participant.positions.clear();
        participant.unrealized_pnl = 0;
        msg!("All positions liquidated. Participant equity reset.");
    }

    Ok(())
}
