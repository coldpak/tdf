use anchor_lang::prelude::*;
use std::sync::atomic::{AtomicI64, Ordering};

use crate::state::Direction;

// Global mock price for testing
static MOCK_PRICE: AtomicI64 = AtomicI64::new(188_000_000); // Default: 188 USD * 1e6

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

pub fn calculate_unrealized_pnl(notional: i64, current_price: i64, size: i64, decimals: u8, direction: Direction) -> i64 {
    let current_price128 = current_price as i128;
    let size128 = size as i128;
    let scale = 10i128.pow(decimals as u32);
    let notional128 = notional as i128;
    let dir128 = dir_sign(direction.clone()) as i128;
    let pnl128 = (current_price128 * size128 / scale - notional128) * dir128;
    i64::try_from(pnl128).expect("pnl overflow")
}

pub fn get_price_from_oracle(oracle_feed: &AccountInfo) -> Result<i64> {
  // let price = oracle_feed.try_borrow_data()?.get(0..8)?.try_into().unwrap();
  // Ok(u64::from_le_bytes(price));
  
  // Use mock price for testing
  Ok(MOCK_PRICE.load(Ordering::Relaxed))
}

// Test helper functions for price manipulation
#[cfg(test)]
pub fn set_mock_price(price: i64) {
  MOCK_PRICE.store(price, Ordering::Relaxed);
}

#[cfg(test)]
pub fn get_mock_price() -> i64 {
  MOCK_PRICE.load(Ordering::Relaxed)
}

// Allow dead code for test functions
#[allow(dead_code)]
pub fn set_mock_price_for_testing(price: i64) {
  MOCK_PRICE.store(price, Ordering::Relaxed);
}

#[allow(dead_code)]
pub fn get_mock_price_for_testing() -> i64 {
  MOCK_PRICE.load(Ordering::Relaxed)
}
