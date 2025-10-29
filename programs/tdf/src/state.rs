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
    pub created_at: i64,  // timestamp
    pub max_leverage: u8, // e.g. 20x
    pub bump: u8,
}

#[account]
pub struct League {
    pub creator: Pubkey,
    pub markets: Vec<Pubkey>,
    pub start_ts: i64, // timestamp
    pub end_ts: i64,   // timestamp
    pub nonce: u8,

    pub entry_token_mint: Pubkey, // SPL token for entry fees, if SOL => wSOL
    pub entry_amount: i64,        // token amount to enter the league
    pub reward_vault: Pubkey,     // SPL token vault for rewards

    pub metadata_uri: String, // URI to the league metadata
    pub status: LeagueStatus,
    pub max_participants: u32,
    pub virtual_on_deposit: i64, // Paper dollar (e.g., 10_000 * 1e6)
    pub max_leverage: u8,        // e.g. 20x

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum LeagueStatus {
    Pending,
    Active,
    Closed,
    Finalized,
}

#[account]
pub struct Participant {
    pub league: Pubkey,
    pub user: Pubkey,
    pub claimed: bool, // if the user has claimed the reward

    // Realtime stats
    pub virtual_balance: i64, // Paper dollar (e.g., 10_000 * 1e6), only update when position is updated
    pub unrealized_pnl: i64,  // accumulated unrealized PnL, update with position checking cycle
    pub used_margin: i64, // used margin for current position, update with position is opened or updated

    pub total_volume: i64, // accumulated volume, only update when position is opened or updated
    pub topk_equity_index: u16, // TopK equity index if not in, 0xFFFF
    pub topk_volume_index: u16, // TopK volume index if not in, 0xFFFF

    // Position tracking sequence number
    pub current_position_seq: u64, // sequence number of current position
    pub positions: Vec<Pubkey>,    // position accounts, max length is 10

    pub bump: u8,
}

impl Participant {
    // equity = virtual_balance + unrealized_pnl
    // available balance = equity - used_margin
    pub fn equity(&self) -> i64 {
        self.virtual_balance + self.unrealized_pnl
    }

    pub fn available_balance(&self) -> i64 {
        self.equity() - self.used_margin
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum Direction {
    Long = 1,
    Short = -1,
}

#[account]
pub struct Position {
    pub league: Pubkey,
    pub user: Pubkey,
    pub market: Pubkey,
    pub market_decimals: u8,
    pub oracle_feed: Pubkey,
    pub seq_num: u64, // sequence number for position tracking

    pub direction: Direction,
    pub entry_price: i64, // average price in price-decimal (1e6)
    pub entry_size: i64,  // token amount of entry size
    pub leverage: u8,     // e.g. 5x

    // Realtime stats
    pub size: i64,           // token amount of current position
    pub notional: i64,       // cache: entry_price * size (1e6) - input capital in $
    pub unrealized_pnl: i64, // (last_updated_price - entry_price) * size * direction
    // notional + unrealized_pnl = current value of position in $
    pub opened_at: i64,
    pub closed_at: i64,

    pub closed_size: i64,   // size closed so far
    pub closed_price: i64,  // price in price-decimal (1e6)
    pub closed_equity: i64, // closed_price * size (1e6)
    pub closed_pnl: i64,    // (closed_notional - notional) * direction

    pub bump: u8,
}

#[account]
pub struct Leaderboard {
    pub league: Pubkey,
    pub k: u16, // top k participants, max is 50 for now
    pub topk_equity: Vec<Pubkey>, // participant pubkeys
    pub topk_equity_scores: Vec<i64>, // scores of top k participants

    pub topk_volume: Vec<Pubkey>, // participant pubkeys
    pub topk_volume_scores: Vec<i64>, // scores of top k participants

    pub last_updated: i64,
    pub bump: u8,
}
