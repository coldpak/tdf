use anchor_lang::prelude::*;

use crate::state::{GlobalState, Market};

#[derive(Accounts)]
pub struct ListMarket<'info> {
    #[account(mut)]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        init,
        payer = admin,
        space = 8 + 16 + 32 + 32 + 1 + 32 + 1 + 8 + 1,
        seeds = [b"market", oracle_feed.key().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    pub oracle_feed: AccountInfo<'info>,
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
    created_at: i64,
) -> Result<()> {
    let bump = ctx.bumps.market;
    let market = &mut ctx.accounts.market;
    market.symbol = symbol;
    market.oracle_feed = ctx.accounts.oracle_feed.key();
    market.base_currency = ctx.accounts.base_currency.key();
    market.decimals = decimals;
    market.listed_by = ctx.accounts.admin.key();
    market.is_active = true;
    market.created_at = created_at;
    market.bump = bump;

    msg!("Market listed: {:?}", market.symbol);
    Ok(())
}
