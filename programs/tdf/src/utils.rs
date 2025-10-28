use anchor_lang::prelude::*;

use crate::errors::ErrorCode;
use crate::state::Direction;

// Define the Oracle PriceFeed struct locally to avoid global allocator conflicts
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PriceFeed {
    pub price: i64,
    pub last_updated: i64,
    pub authority: Pubkey,
    pub bump: u8,
}

pub fn dir_sign(direction: Direction) -> i64 {
    match direction {
        Direction::Long => 1,
        Direction::Short => -1,
    }
}

pub fn calculate_notional(price: i64, size: i64, decimals: u8) -> i64 {
    let scale = 10i128.pow(decimals as u32);
    let price128 = price as i128;
    let size128 = size as i128;

    // (price * size) / 10^decimals
    let notional = (price128 * size128) / scale;

    i64::try_from(notional).expect("notional overflow")
}

pub fn calculate_unrealized_pnl(
    notional: i64,
    current_price: i64,
    size: i64,
    decimals: u8,
    direction: Direction,
) -> i64 {
    let current_price128 = current_price as i128;
    let size128 = size as i128;
    let scale = 10i128.pow(decimals as u32);
    let notional128 = notional as i128;
    let dir128 = dir_sign(direction.clone()) as i128;
    let pnl128 = (current_price128 * size128 / scale - notional128) * dir128;
    i64::try_from(pnl128).expect("pnl overflow")
}

pub fn calculate_price_from_notional_and_size(notional: i64, size: i64, decimals: u8) -> i64 {
    let scale = 10i128.pow(decimals as u32);
    let notional128 = notional as i128;
    let size128 = size as i128;
    let price128 = notional128 / size128 * scale;
    i64::try_from(price128).expect("price overflow")
}

pub fn get_price_from_oracle(oracle_feed: &AccountInfo) -> Result<i64> {
    let data = oracle_feed.try_borrow_data()?;

    // Try to deserialize the PriceFeed account using Oracle's struct
    match PriceFeed::try_from_slice(&data) {
        Ok(price_feed) => {
            if price_feed.price <= 0 {
                return Err(ErrorCode::InvalidPrice.into());
            }
            Ok(price_feed.price)
        }
        Err(_) => {
            // Fallback: manual parsing after discriminator
            if data.len() < 16 {
                return Err(ErrorCode::InvalidPrice.into());
            }

            // Read price from bytes 8-16 (after discriminator)
            let price_bytes: [u8; 8] = data[8..16]
                .try_into()
                .map_err(|_| ErrorCode::InvalidPrice)?;
            let price = i64::from_le_bytes(price_bytes);

            if price <= 0 {
                return Err(ErrorCode::InvalidPrice.into());
            }

            Ok(price)
        }
    }
}
