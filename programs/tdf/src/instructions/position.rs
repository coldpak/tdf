use anchor_lang::prelude::*;

use crate::state::{Direction, League, LeagueStatus, Market, Participant, Position};
use crate::utils::{calculate_notional, calculate_unrealized_pnl, dir_sign, get_price_from_oracle};

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
        space = 8 + 32*4 + 8 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1,
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

    let current_price = get_price_from_oracle(&ctx.accounts.oracle_feed)?;
    let notional = calculate_notional(current_price, size, market.decimals);

    let required_margin = notional / leverage as i64;
    require!(
        participant.available_balance() >= required_margin,
        crate::errors::ErrorCode::InsufficientMargin
    );

    // Create new position
    position.league = league.key();
    position.user = ctx.accounts.user.key();
    position.market = market.key();
    position.seq_num = participant.current_position_seq;
    position.direction = direction;
    position.size = size;
    position.entry_price = current_price;
    position.notional = notional;
    position.leverage = leverage;
    position.opened_at = Clock::get()?.unix_timestamp;
    position.bump = ctx.bumps.position;

    // Update participant
    participant.total_volume += notional;
    participant.used_margin += required_margin;
    participant.current_position_seq += 1;
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

    let leverage = position.leverage;
    let current_price = get_price_from_oracle(&ctx.accounts.oracle_feed)?;
    let new_notional = calculate_notional(current_price, size, market.decimals);

    let additional_margin = new_notional / leverage as i64;
    require!(
        participant.available_balance() >= additional_margin,
        crate::errors::ErrorCode::InsufficientMargin
    );

    let prev_upnl = position.unrealized_pnl;
    position.size += size;
    position.notional += new_notional;
    position.entry_price = position.notional / position.size;
    position.unrealized_pnl = calculate_unrealized_pnl(
        position.notional,
        current_price,
        position.size,
        market.decimals,
        position.direction.clone()
    );

    // Update participant
    participant.used_margin += additional_margin;
    participant.total_volume += new_notional;
    participant.unrealized_pnl += position.unrealized_pnl - prev_upnl;

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
    require!(size_to_close > 0, crate::errors::ErrorCode::InvalidPositionSize);
    require!(
        league.status == LeagueStatus::Active,
        crate::errors::ErrorCode::LeagueNotActive
    );
    require!(
        size_to_close <= position.size,
        crate::errors::ErrorCode::InvalidReduceSize
    );
    let prev_upnl = position.unrealized_pnl;

    // Calculate realized PnL
    let closing_equity = current_price.checked_mul(size_to_close).expect("closing equity overflow");
    let closing_notional = calculate_notional(position.entry_price, size_to_close, market.decimals);
    let realized_pnl = (closing_equity as i64 - closing_notional as i64)
        * dir_sign(position.direction.clone()) as i64;
    let prev_locked = position.notional / position.leverage as i64;
    let new_locked = (position.notional - closing_notional) / position.leverage as i64;
    let released_margin = prev_locked - new_locked;

    // Calculate closed stats
    position.closed_size += size_to_close;
    position.closed_notional += closing_notional;
    position.closed_price = position.closed_notional / position.closed_size;
    position.closed_pnl += realized_pnl;

    // Update position
    position.size -= size_to_close;
    position.notional -= closing_notional;
    position.unrealized_pnl = calculate_unrealized_pnl(
        position.notional,
        current_price,
        position.size,
        market.decimals,
        position.direction.clone()
    );

    // Update participant
    participant.total_volume += closing_notional;
    participant.used_margin -= released_margin;
    participant.virtual_balance = participant.virtual_balance + realized_pnl + released_margin;
    participant.unrealized_pnl += position.unrealized_pnl - prev_upnl;

    msg!(
        "Position size decreased to {}, PnL: {}",
        position.size,
        realized_pnl
    );

    if position.size == 0 {
        // close position logic here
        position.closed_at = Clock::get()?.unix_timestamp;
        // remove position from participant.positions vector
        if let Some(idx) = participant
            .positions
            .iter()
            .position(|p| p == &position.key())
        {
            participant.positions.remove(idx);
        }
        msg!("Position closed");
    }

    Ok(())
}
