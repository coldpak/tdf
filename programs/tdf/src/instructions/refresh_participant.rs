use crate::state::{Leaderboard, League, Participant, Position};
use crate::utils::{
    calculate_notional, calculate_price_from_notional_and_size, calculate_unrealized_pnl,
    get_price_from_oracle,
};
use anchor_lang::prelude::*;

/// Use MagicAction to update the leaderboard on commit
/// TODO: split UpdateLeaderboard and CommitAndUpdateLeaderboard instructions to apply MagicAction
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

    #[account(
        mut,
        seeds = [b"leaderboard", league.key().as_ref()],
        bump = leaderboard.bump
    )]
    pub leaderboard: Account<'info, Leaderboard>,

    /// CHECK: This account is validated by the participant account's user field
    pub user: AccountInfo<'info>,
    pub league: Account<'info, League>,

    // remaining accounts = [position_index_0, oracle_0, position_index_1, oracle_1, ...]
}

/// commit and update leaderboard
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

    // Update leaderboard
    let leaderboard = &mut ctx.accounts.leaderboard;
    let participant_key = participant.key();
    let equity = participant.equity();
    let volume = participant.total_volume;

    update_topk_equity(leaderboard, participant_key, equity)?;
    update_topk_volume(leaderboard, participant_key, volume)?;

    leaderboard.last_updated = Clock::get()?.unix_timestamp;

    msg!(
        "Leaderboard updated: last_updated: {}",
        leaderboard.last_updated
    );

    Ok(())
}

fn update_topk_equity(leaderboard: &mut Leaderboard, key: Pubkey, score: i64) -> Result<()> {
    let list = &mut leaderboard.topk_equity;
    let scores = &mut leaderboard.topk_equity_scores;
    update_topk_list(list, scores, key, score, leaderboard.k)
}

fn update_topk_volume(leaderboard: &mut Leaderboard, key: Pubkey, score: i64) -> Result<()> {
    let list = &mut leaderboard.topk_volume;
    let scores = &mut leaderboard.topk_volume_scores;
    update_topk_list(list, scores, key, score, leaderboard.k)
}

fn update_topk_list(
    list: &mut Vec<Pubkey>,
    scores: &mut Vec<i64>,
    key: Pubkey,
    score: i64,
    k: u16,
) -> Result<()> {
    // If k is 0, don't do anything
    if k == 0 {
        return Ok(());
    }

    // Create a new combined vector to avoid borrowing issues
    let mut combined: Vec<(Pubkey, i64)> = Vec::new();

    // Add existing entries
    for (i, &addr) in list.iter().enumerate() {
        if i < scores.len() {
            combined.push((addr, scores[i]));
        }
    }

    // Update or add the current entry
    if let Some(pos) = combined.iter().position(|(addr, _)| *addr == key) {
        combined[pos] = (key, score);
    } else {
        combined.push((key, score));
    }

    // Sort by score (descending)
    combined.sort_by(|a, b| b.1.cmp(&a.1));

    // Keep only top k entries
    let topk = combined.into_iter().take(k as usize).collect::<Vec<_>>();

    // Update the original vectors
    list.clear();
    scores.clear();
    for (addr, sc) in topk {
        list.push(addr);
        scores.push(sc);
    }

    Ok(())
}
