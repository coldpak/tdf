use anchor_lang::prelude::*;

declare_id!("6WPoE3jetRFmcfBnrmwukJGcHjwDkkSydHb3fcGp9a8n");

#[program]
pub mod oracle {
    use super::*;

    pub fn initialize_price_feed(ctx: Context<InitializePriceFeed>, initial_price: i64) -> Result<()> {
        let price_feed = &mut ctx.accounts.price_feed;
        price_feed.price = initial_price;
        price_feed.last_updated = Clock::get()?.unix_timestamp;
        price_feed.authority = ctx.accounts.authority.key();
        price_feed.bump = ctx.bumps.price_feed;
        
        msg!("Price feed initialized with price: {}", initial_price);
        Ok(())
    }

    pub fn set_price(ctx: Context<SetPrice>, new_price: i64) -> Result<()> {
        let price_feed = &mut ctx.accounts.price_feed;
        price_feed.price = new_price;
        price_feed.last_updated = Clock::get()?.unix_timestamp;
        
        msg!("Price updated to: {}", new_price);
        Ok(())
    }

    pub fn get_price(ctx: Context<GetPrice>) -> Result<i64> {
        let price_feed = &ctx.accounts.price_feed;
        Ok(price_feed.price)
    }
}

#[derive(Accounts)]
pub struct InitializePriceFeed<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 8 + 8 + 32 + 1,
        seeds = [b"price_feed"],
        bump
    )]
    pub price_feed: Account<'info, PriceFeed>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPrice<'info> {
    #[account(
        mut,
        seeds = [b"price_feed"],
        bump = price_feed.bump,
        has_one = authority
    )]
    pub price_feed: Account<'info, PriceFeed>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetPrice<'info> {
    #[account(
        seeds = [b"price_feed"],
        bump = price_feed.bump
    )]
    pub price_feed: Account<'info, PriceFeed>,
}

#[account]
pub struct PriceFeed {
    pub price: i64,
    pub last_updated: i64,
    pub authority: Pubkey,
    pub bump: u8,
}
