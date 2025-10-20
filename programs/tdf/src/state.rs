use anchor_lang::prelude::*;

#[account]
pub struct GlobalState {
    pub admin: Pubkey,
    pub fee_bps: u16,
    pub treasury: Pubkey,
    pub permission_program: Pubkey, // MagicBlock Permission Program
    pub bump: u8,
}

#[account]
pub struct Market {
    pub symbol: [u8; 16],      // "SOL/USDC"
    pub oracle_feed: Pubkey,   // feed address
    pub base_currency: Pubkey, // e.g., USDC
    pub decimals: u8,
    pub listed_by: Pubkey, // admin
    pub is_active: bool,
    pub created_at: i64, // timestamp
    pub bump: u8,
}

#[account]
pub struct League {
    pub creator: Pubkey,
    pub markets: Vec<Pubkey>,
    pub start_ts: i64, // timestamp
    pub end_ts: i64,   // timestamp

    pub entry_token_mint: Pubkey, // SPL token for entry fees, if SOL => wSOL
    pub entry_amount: u64,    // token amount to enter the league
    pub reward_vault: Pubkey,     // SPL token vault for rewards

    pub metadata_uri: String, // URI to the league metadata
    pub is_closed: bool,
    pub bump: u8,
}

#[account]
pub struct LeagueMemberDeposit {
    pub league: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}
