use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid reward vault address")]
    InvalidRewardVault,
    #[msg("League is not active")]
    LeagueNotActive,
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
    #[msg("Invalid status")]
    InvalidStatus,
    #[msg("Start time not reached")]
    StartTimeNotReached,
    #[msg("Not creator")]
    NotCreator,
}
