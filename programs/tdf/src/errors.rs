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
    #[msg("Invalid user entry ATA")]
    InvalidUserEntryATA,
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
    #[msg("Invalid leverage")]
    InvalidLeverage,
    #[msg("Insufficient margin")]
    InsufficientMargin,
    #[msg("Invalid position sequence")]
    InvalidPositionSequence,
    #[msg("Position already exists")]
    PositionAlreadyExists,
    #[msg("Invalid reduce size")]
    InvalidReduceSize,
    #[msg("Max open position exceeded")]
    MaxOpenPositionExceeded,
    #[msg("Invalid position size")]
    InvalidPositionSize,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Invalid refresh accounts")]
    InvalidRefreshAccounts,
    #[msg("Position mismatch")]
    PositionMismatch,
    #[msg("Oracle mismatch")]
    OracleMismatch,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid leaderboard size limit")]
    InvalidLeaderboardSizeLimit,
}
