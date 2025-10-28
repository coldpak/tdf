use crate::state::{League, Participant, Position};
use crate::utils::{calculate_unrealized_pnl, get_price_from_oracle};
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
    let position_keys = &participant.positions;

    require!(
        remaining.len() == position_keys.len() * 2,
        crate::errors::ErrorCode::InvalidRefreshAccounts
    );

    let mut total_upnl: i64 = 0;
    let mut total_used_margin: i64 = 0;

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
            continue;
        }

        require_keys_eq!(
            position.oracle_feed,
            oracle_ai.key(),
            crate::errors::ErrorCode::OracleMismatch
        );

        let price = get_price_from_oracle(&oracle_ai)?;

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

    // if participant.equity() < 0 {
    //     msg!("💥 Auto liquidation triggered");
    //     for (i, position_key) in position_keys.iter().enumerate() {
    //         let position_ai = &remaining[i * 2];
    //         let oracle_ai = &remaining[i * 2 + 1];

    //         let mut data = position_ai.try_borrow_mut_data()?;
    //         let mut position: Position = Position::try_deserialize(&mut &data[..])?;

    //         if position.size == 0 {
    //             continue;
    //         }

    //         let realized_pnl = position.unrealized_pnl;
    //         let released_margin = position.notional / position.leverage as i64;

    //         // Calculate closed stats
    //         position.closed_size += position.size;
    //         position.closed_notional += position.notional;
    //         position.closed_price = position.closed_notional / position.closed_size;
    //         position.closed_pnl += realized_pnl;
    //     }
    // }

    Ok(())
}
