use anchor_lang::prelude::*;

mod errors;
mod instructions;
mod state;

declare_id!("3jFHqM7VCceGLftStfrhLHHKRHBJZyteYuA5c63HXjuY");

#[program]
pub mod tdf {
    pub use super::instructions::*;
    use super::*;

    // Global state initialization
    pub fn initialize_global_state(
        ctx: Context<InitializeGlobalState>,
        fee_bps: u16,
        treasury: Pubkey,
        permission_program: Pubkey,
    ) -> Result<()> {
        instructions::initialize_global_state(ctx, fee_bps, treasury, permission_program)
    }

    // Market instructions
    pub fn list_market(
        ctx: Context<ListMarket>,
        symbol: [u8; 16],
        decimals: u8,
        created_at: i64,
    ) -> Result<()> {
        instructions::list_market(ctx, symbol, decimals, created_at)
    }

    // League instructions
    pub fn create_league(
        ctx: Context<CreateLeague>,
        start_ts: i64,
        end_ts: i64,
        entry_amount: u64,
        markets: Vec<Pubkey>,
        metadata_uri: String,
    ) -> Result<()> {
        instructions::create_league(ctx, start_ts, end_ts, entry_amount, markets, metadata_uri)
    }

    pub fn join_league(ctx: Context<JoinLeague>, amount: u64) -> Result<()> {
        instructions::join_league(ctx, amount)
    }
}
