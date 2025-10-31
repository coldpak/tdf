use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

mod errors;
mod instructions;
mod state;
mod utils;

declare_id!("3jFHqM7VCceGLftStfrhLHHKRHBJZyteYuA5c63HXjuY");

#[ephemeral]
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
        max_leverage: u8,
    ) -> Result<()> {
        instructions::list_market(ctx, symbol, decimals, max_leverage)
    }

    // League instructions
    pub fn create_league(
        ctx: Context<CreateLeague>,
        start_ts: i64,
        end_ts: i64,
        entry_amount: i64,
        markets: Vec<Pubkey>,
        metadata_uri: String,
        max_participants: u32,
        virtual_on_deposit: i64,
        max_leverage: u8,
        nonce: u8,
        k: u16,
    ) -> Result<()> {
        instructions::create_league(
            ctx,
            start_ts,
            end_ts,
            entry_amount,
            markets,
            metadata_uri,
            max_participants,
            virtual_on_deposit,
            max_leverage,
            nonce,
            k,
        )
    }

    pub fn join_league(ctx: Context<JoinLeague>, amount: i64) -> Result<()> {
        instructions::join_league(ctx, amount)
    }

    pub fn delegate_participant(ctx: Context<DelegateParticipant>, league_key: Pubkey) -> Result<()> {
        instructions::delegate_participant(ctx, league_key)
    }

    pub fn undelegate_participant(ctx: Context<UndelegateParticipant>, league_key: Pubkey) -> Result<()> {
        instructions::undelegate_participant(ctx, league_key)
    }

    pub fn start_league(ctx: Context<StartLeague>) -> Result<()> {
        instructions::start_league(ctx)
    }

    pub fn close_league(ctx: Context<CloseLeague>) -> Result<()> {
        instructions::close_league(ctx)
    }

    // Position instructions
    pub fn open_position(
        ctx: Context<OpenPosition>,
        direction: state::Direction,
        size: i64,
        leverage: u8,
        seq_num: u64,
    ) -> Result<()> {
        instructions::open_position(ctx, direction, size, leverage, seq_num)
    }

    pub fn delegate_position(ctx: Context<DelegatePosition>, league_key: Pubkey, seq_num: u64) -> Result<()> {
        instructions::delegate_position(ctx, league_key, seq_num)
    }

    pub fn increase_position_size(ctx: Context<IncreasePositionSize>, size: i64) -> Result<()> {
        instructions::increase_position_size(ctx, size)
    }

    pub fn decrease_position_size(
        ctx: Context<DecreasePositionSize>,
        size_to_close: i64,
    ) -> Result<()> {
        instructions::decrease_position_size(ctx, size_to_close)
    }

    // Refresh participant instruction
    pub fn refresh_participant<'info>(
        ctx: Context<'_, '_, 'info, 'info, RefreshParticipant<'info>>,
    ) -> Result<()> {
        instructions::refresh_participant(ctx)
    }

    // Claim reward instruction
    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        instructions::claim_reward(ctx)
    }
}
