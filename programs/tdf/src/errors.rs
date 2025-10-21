use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid reward vault address")]
    InvalidRewardVault,
    #[msg("League is already closed")]
    LeagueAlreadyClosed,
    #[msg("Insufficient entry amount")]
    InsufficientEntryAmount,
    #[msg("Invalid entry token mint")]
    InvalidEntryTokenMint,
    #[msg("Invalid markets length")]
    InvalidMarketsLength,
    #[msg("Not admin")]
    NotAdmin,
    #[msg("Market already exists")]
    MarketAlreadyExists,
}
