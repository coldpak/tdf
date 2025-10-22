use anchor_lang::prelude::*;

use crate::state::{GlobalState, Market};

#[derive(Accounts)]
pub struct ListMarket<'info> {
    #[account(mut)]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        init,
        payer = admin,
        space = 8 + 16 + 32 + 32 + 1 + 32 + 1 + 8 + 1 + 1,
        seeds = [b"market", oracle_feed.key().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    /// CHECK: Oracle feed account - validated by the oracle program
    pub oracle_feed: AccountInfo<'info>,
    /// CHECK: Base currency account - validated by the token program
    pub base_currency: AccountInfo<'info>,
    #[account(
        mut,
        constraint = admin.key() == global_state.admin
    )]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn list_market(
    ctx: Context<ListMarket>,
    symbol: [u8; 16],
    decimals: u8,
    max_leverage: u8,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let bump = ctx.bumps.market;
    let market = &mut ctx.accounts.market;
    market.symbol = symbol;
    market.oracle_feed = ctx.accounts.oracle_feed.key();
    market.base_currency = ctx.accounts.base_currency.key();
    market.decimals = decimals;
    market.listed_by = ctx.accounts.admin.key();
    market.is_active = true;
    market.created_at = now;
    market.max_leverage = max_leverage;
    market.bump = bump;

    msg!("Market listed: {:?}", market.symbol);
    Ok(())
}
