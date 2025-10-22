use anchor_lang::prelude::*;
use anchor_spl::associated_token::{get_associated_token_address, AssociatedToken};
use anchor_spl::token::{Token, Transfer};

use crate::state::{League, LeagueStatus, Participant};

/// Market is bounded to 10
#[derive(Accounts)]
#[instruction(start_ts: i64, end_ts: i64, entry_amount: u64, markets: Vec<Pubkey>, metadata_uri: String, max_participants: u32, virtual_on_deposit: u64, max_leverage: u8, nonce: u8)]
pub struct CreateLeague<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + 32 + (4 + (32 * 10)) + 8 + 8 + 1 + 32 + 8 + 32 + (4 + 200) + 1 + 4 + 8 + 1 + 1,
        seeds = [b"league", creator.key().as_ref(), &[nonce]],
        bump
    )]
    pub league: Account<'info, League>,

    /// CHECK: Entry token mint - validated by the token program
    pub entry_token_mint: AccountInfo<'info>,

    /// CHECK: reward vault ATA for the league - will be created if it doesn't exist
    #[account(mut)]
    pub reward_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

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
) -> Result<()> {
    // Validate markets vector size (max 10 markets)
    require!(
        markets.len() <= 10,
        crate::errors::ErrorCode::InvalidMarketsLength
    );

    let bump = ctx.bumps.league;
    let league = &mut ctx.accounts.league;
    let entry_token_mint = ctx.accounts.entry_token_mint.key();

    let reward_vault_ata = get_associated_token_address(&league.key(), &entry_token_mint);

    // Check if the provided reward_vault matches the expected ATA address
    require_keys_eq!(
        ctx.accounts.reward_vault.key(),
        reward_vault_ata,
        crate::errors::ErrorCode::InvalidRewardVault
    );

    // Check if the ATA account exists and has data
    let ata_account_info = &ctx.accounts.reward_vault;
    if ata_account_info.data_is_empty() {
        // Create the associated token account if it doesn't exist
        anchor_spl::associated_token::create(CpiContext::new(
            ctx.accounts.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: ctx.accounts.creator.to_account_info(),
                associated_token: ctx.accounts.reward_vault.to_account_info(),
                authority: league.to_account_info(),
                mint: ctx.accounts.entry_token_mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
        ))?;

        msg!(
            "Created associated token account for league: {:?}",
            reward_vault_ata
        );
    } else {
        msg!(
            "Associated token account already exists: {:?}",
            reward_vault_ata
        );
    }

    league.creator = ctx.accounts.creator.key();
    league.markets = markets;
    league.start_ts = start_ts;
    league.end_ts = end_ts;
    league.nonce = nonce;

    league.entry_token_mint = ctx.accounts.entry_token_mint.key();
    league.entry_amount = entry_amount;
    league.virtual_on_deposit = virtual_on_deposit;
    league.max_leverage = max_leverage;

    league.reward_vault = ctx.accounts.reward_vault.key();
    league.metadata_uri = metadata_uri;
    league.status = LeagueStatus::Pending;
    league.max_participants = max_participants;
    league.bump = bump;

    msg!("League created: {:?}", league.key());
    Ok(())
}

#[derive(Accounts)]
pub struct JoinLeague<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub league: Account<'info, League>,

    #[account(
        init,
        payer = user,
        space = 8 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 2 + 2 + 8 + (4 + 32 * 10) + 1,
        seeds = [b"participant", league.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub participant: Account<'info, Participant>,

    /// CHECK: Reward vault ATA for transfer entry token to the league
    #[account(mut)]
    pub reward_vault: UncheckedAccount<'info>,

    /// CHECK: Entry token mint - validated by the token program
    pub entry_token_mint: UncheckedAccount<'info>,

    /// CHECK: User entry ATA for transfer entry token to the league
    #[account(mut)]
    pub user_entry_ata: UncheckedAccount<'info>,

    /// CHECK: League reward vault ATA for transfer entry token to the league
    #[account(mut)]
    pub vault_entry_ata: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn join_league(ctx: Context<JoinLeague>, amount: i64) -> Result<()> {
    let league = &ctx.accounts.league;
    require!(
        league.status == LeagueStatus::Active,
        crate::errors::ErrorCode::LeagueNotActive
    );
    require!(
        amount >= league.entry_amount,
        crate::errors::ErrorCode::InsufficientEntryAmount
    );
    require_keys_eq!(league.entry_token_mint, ctx.accounts.entry_token_mint.key());

    let participant = &mut ctx.accounts.participant;
    participant.league = league.key();
    participant.user = ctx.accounts.user.key();
    participant.claimed = false;
    participant.virtual_balance = league.virtual_on_deposit;
    participant.positions = Vec::new();
    participant.topk_equity_index = 0xFFFF;
    participant.topk_volume_index = 0xFFFF;
    participant.bump = ctx.bumps.participant;

    msg!("User joined league: {:?}", league.key());
    Ok(())
}

#[derive(Accounts)]
pub struct StartLeague<'info> {
    #[account(mut)]
    pub league: Account<'info, League>,

    #[account(mut)]
    pub user: Signer<'info>,
}

pub fn start_league(ctx: Context<StartLeague>) -> Result<()> {
    let league = &mut ctx.accounts.league;

    // 상태 체크: Pending만 시작 가능
    require!(
        league.status == LeagueStatus::Pending,
        crate::errors::ErrorCode::InvalidStatus
    );

    // If start time is not reached, only creator can start the league
    // But if start time is reached, anyone can start the league
    let now = Clock::get()?.unix_timestamp;
    if now < league.start_ts {
        require!(
            ctx.accounts.user.key() == league.creator,
            crate::errors::ErrorCode::NotCreator
        );
    }

    league.status = LeagueStatus::Active;
    msg!("League {:?} started!", league.key());

    Ok(())
}

#[derive(Accounts)]
pub struct CloseLeague<'info> {
    #[account(mut)]
    pub league: Account<'info, League>,

    #[account(mut)]
    pub user: Signer<'info>,
}

pub fn close_league(ctx: Context<CloseLeague>) -> Result<()> {
    let league = &mut ctx.accounts.league;

    // Check if the league is active
    require!(
        league.status == LeagueStatus::Active,
        crate::errors::ErrorCode::InvalidStatus
    );

    // If end time is not reached, only creator can close the league
    // But, if end time is reached, anyone can close the league
    let now = Clock::get()?.unix_timestamp;
    if now < league.end_ts {
        require!(
            ctx.accounts.user.key() == league.creator,
            crate::errors::ErrorCode::NotCreator
        );
    }
    league.status = LeagueStatus::Closed;
    msg!("League {:?} closed!", league.key());

    Ok(())
}
