use anchor_lang::prelude::*;

use crate::state::{Direction, League, LeagueStatus, Market, Participant, Position};
use crate::utils::{
    calculate_notional, calculate_price_from_notional_and_size, calculate_unrealized_pnl, dir_sign,
    get_price_from_oracle,
};

// TODO: participant should be updated in realtime to avoid liquidation risk
#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"participant", league.key().as_ref(), user.key().as_ref()],
        bump = participant.bump
    )]
    pub participant: Account<'info, Participant>,

    #[account(
        init,
        payer = user,
        space = 8 + 32*5 + 8 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1,
        seeds = [b"position", league.key().as_ref(), user.key().as_ref(), participant.current_position_seq.to_le_bytes().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    pub league: Account<'info, League>,
    pub market: Account<'info, Market>,
    /// CHECK: oracle feed from market
    pub oracle_feed: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn open_position(
    ctx: Context<OpenPosition>,
    direction: Direction,
    size: i64,
    leverage: u8,
    seq_num: u64,
) -> Result<()> {
    let league = &ctx.accounts.league;
    let market = &ctx.accounts.market;
    let participant = &mut ctx.accounts.participant;
    let position = &mut ctx.accounts.position;

    require!(
        league.status == LeagueStatus::Active,
        crate::errors::ErrorCode::LeagueNotActive
    );
    require!(
        leverage <= league.max_leverage,
        crate::errors::ErrorCode::InvalidLeverage
    );
    require!(
        participant.positions.len() < 10,
        crate::errors::ErrorCode::MaxOpenPositionExceeded
    );
    require!(
        seq_num == participant.current_position_seq,
        crate::errors::ErrorCode::InvalidPositionSequence
    );
    require!(
        ctx.accounts.oracle_feed.key() == market.oracle_feed,
        crate::errors::ErrorCode::OracleMismatch
    );

    let current_price = get_price_from_oracle(&ctx.accounts.oracle_feed)?;
    let notional = calculate_notional(current_price, size, market.decimals);

    let required_margin = notional
        .checked_div(leverage as i64)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    require!(
        participant.available_balance() >= required_margin,
        crate::errors::ErrorCode::InsufficientMargin
    );

    // Create new position
    position.league = league.key();
    position.user = ctx.accounts.user.key();
    position.market = market.key();
    position.market_decimals = market.decimals;
    position.oracle_feed = ctx.accounts.oracle_feed.key();
    position.seq_num = participant.current_position_seq;
    position.direction = direction;
    position.entry_size = size;
    position.size = size;
    position.entry_price = current_price;
    position.notional = notional;
    position.leverage = leverage;
    position.opened_at = Clock::get()?.unix_timestamp;
    position.bump = ctx.bumps.position;

    // Update participant with overflow protection
    participant.total_volume = participant
        .total_volume
        .checked_add(notional)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    participant.used_margin = participant
        .used_margin
        .checked_add(required_margin)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    participant.current_position_seq = participant
        .current_position_seq
        .checked_add(1)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    participant.positions.push(position.key());

    msg!("New position opened at price {}", current_price);
    Ok(())
}

#[derive(Accounts)]
pub struct IncreasePositionSize<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"participant", league.key().as_ref(), user.key().as_ref()],
        bump = participant.bump
    )]
    pub participant: Account<'info, Participant>,

    #[account(
        mut,
        seeds = [b"position", league.key().as_ref(), user.key().as_ref(), position.seq_num.to_le_bytes().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,

    pub league: Account<'info, League>,
    pub market: Account<'info, Market>,
    /// CHECK: oracle feed from market
    pub oracle_feed: AccountInfo<'info>,
}

pub fn increase_position_size(ctx: Context<IncreasePositionSize>, size: i64) -> Result<()> {
    let league = &ctx.accounts.league;
    let market = &ctx.accounts.market;
    let participant = &mut ctx.accounts.participant;
    let position = &mut ctx.accounts.position;

    require!(
        league.status == LeagueStatus::Active,
        crate::errors::ErrorCode::LeagueNotActive
    );
    require!(
        ctx.accounts.oracle_feed.key() == market.oracle_feed,
        crate::errors::ErrorCode::OracleMismatch
    );

    let leverage = position.leverage;
    let current_price = get_price_from_oracle(&ctx.accounts.oracle_feed)?;
    let new_notional = calculate_notional(current_price, size, market.decimals);

    let additional_margin = new_notional
        .checked_div(leverage as i64)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    require!(
        participant.available_balance() >= additional_margin,
        crate::errors::ErrorCode::InsufficientMargin
    );

    // Update entry stats with overflow protection
    let prev_entry_notional =
        calculate_notional(position.entry_price, position.entry_size, market.decimals);
    position.entry_size = position
        .entry_size
        .checked_add(size)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    let new_entry_notional = prev_entry_notional
        .checked_add(new_notional)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    position.entry_price = new_entry_notional / position.entry_size;

    // Update realtime stats with overflow protection
    let prev_upnl = position.unrealized_pnl;
    position.size = position
        .size
        .checked_add(size)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    position.notional = position
        .notional
        .checked_add(new_notional)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    position.unrealized_pnl = calculate_unrealized_pnl(
        position.notional,
        current_price,
        position.size,
        market.decimals,
        position.direction.clone(),
    );

    // Update participant with overflow protection
    participant.used_margin = participant
        .used_margin
        .checked_add(additional_margin)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    participant.total_volume = participant
        .total_volume
        .checked_add(new_notional)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;

    let upnl_delta = position
        .unrealized_pnl
        .checked_sub(prev_upnl)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    participant.unrealized_pnl = participant
        .unrealized_pnl
        .checked_add(upnl_delta)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;

    msg!("Position size increased to {}", position.size);

    Ok(())
}

#[derive(Accounts)]
pub struct DecreasePositionSize<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"participant", league.key().as_ref(), user.key().as_ref()],
        bump = participant.bump
    )]
    pub participant: Account<'info, Participant>,

    #[account(
        mut,
        seeds = [b"position", league.key().as_ref(), user.key().as_ref(), position.seq_num.to_le_bytes().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,

    pub league: Account<'info, League>,
    pub market: Account<'info, Market>,
    /// CHECK: oracle feed from market
    pub oracle_feed: AccountInfo<'info>,
}

pub fn decrease_position_size(
    ctx: Context<DecreasePositionSize>,
    size_to_close: i64,
) -> Result<()> {
    let league = &ctx.accounts.league;
    let market = &ctx.accounts.market;
    let participant = &mut ctx.accounts.participant;
    let position = &mut ctx.accounts.position;
    let current_price = get_price_from_oracle(&ctx.accounts.oracle_feed)?;

    require!(current_price > 0, crate::errors::ErrorCode::InvalidPrice);
    require!(
        size_to_close > 0,
        crate::errors::ErrorCode::InvalidPositionSize
    );
    require!(
        league.status == LeagueStatus::Active,
        crate::errors::ErrorCode::LeagueNotActive
    );
    require!(
        ctx.accounts.oracle_feed.key() == market.oracle_feed,
        crate::errors::ErrorCode::OracleMismatch
    );
    require!(
        size_to_close <= position.size,
        crate::errors::ErrorCode::InvalidReduceSize
    );
    let prev_upnl = position.unrealized_pnl;

    // Calculate realized PnL with overflow protection
    let closing_equity = calculate_notional(current_price, size_to_close, market.decimals);
    let closing_notional = calculate_notional(position.entry_price, size_to_close, market.decimals);
    let realized_pnl = (closing_equity as i64 - closing_notional as i64)
        .checked_mul(dir_sign(position.direction.clone()) as i64)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    let prev_locked = position
        .notional
        .checked_div(position.leverage as i64)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    let new_locked = position
        .notional
        .checked_sub(closing_notional)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?
        .checked_div(position.leverage as i64)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    let released_margin = prev_locked
        .checked_sub(new_locked)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;

    // Calculate closed stats with overflow protection
    position.closed_size = position
        .closed_size
        .checked_add(size_to_close)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    position.closed_equity = position
        .closed_equity
        .checked_add(closing_equity)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    position.closed_price = calculate_price_from_notional_and_size(
        position.closed_equity,
        position.closed_size,
        market.decimals,
    );
    position.closed_pnl = position
        .closed_pnl
        .checked_add(realized_pnl)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;

    // Update position with overflow protection
    position.size = position
        .size
        .checked_sub(size_to_close)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    position.notional = position
        .notional
        .checked_sub(closing_notional)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    position.unrealized_pnl = calculate_unrealized_pnl(
        position.notional,
        current_price,
        position.size,
        market.decimals,
        position.direction.clone(),
    );

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

    let upnl_delta = position
        .unrealized_pnl
        .checked_sub(prev_upnl)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;
    participant.unrealized_pnl = participant
        .unrealized_pnl
        .checked_add(upnl_delta)
        .ok_or(crate::errors::ErrorCode::MathOverflow)?;

    msg!(
        "Position size decreased to {}, PnL: {}",
        position.size,
        realized_pnl
    );

    if position.size == 0 {
        // close position logic here
        position.closed_at = Clock::get()?.unix_timestamp;
        // remove position from participant.positions vector
        participant.positions.retain(|p| p != &position.key());
        msg!("Position closed and removed from participant");
    }

    Ok(())
}
