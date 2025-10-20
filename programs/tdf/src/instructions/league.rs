use anchor_lang::prelude::*;
use anchor_spl::associated_token::{get_associated_token_address, AssociatedToken};
use anchor_spl::token::{Token, Mint, Transfer};

use crate::state::{League, LeagueMemberDeposit};

/// Market is bounded to 10
#[derive(Accounts)]
#[instruction(start_ts: i64, markets: Vec<Pubkey>)]
pub struct CreateLeague<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + 32 + (4 + 32 * 10) + 8 + 8 + 32 + 8 + 32 + (4 + 200) + 1 + 1,
        seeds = [b"league", creator.key().as_ref(), start_ts.to_le_bytes().as_ref()],
        bump
    )]
    pub league: Account<'info, League>,

    pub entry_token_mint: Account<'info, Mint>,

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
    entry_amount: u64,
    markets: Vec<Pubkey>,
    metadata_uri: String,
) -> Result<()> {
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
        anchor_spl::associated_token::create(
            CpiContext::new(
                ctx.accounts.associated_token_program.to_account_info(),
                anchor_spl::associated_token::Create {
                    payer: ctx.accounts.creator.to_account_info(),
                    associated_token: ctx.accounts.reward_vault.to_account_info(),
                    authority: league.to_account_info(),
                    mint: ctx.accounts.entry_token_mint.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                },
            ),
        )?;
        
        msg!("Created associated token account for league: {:?}", reward_vault_ata);
    } else {
        msg!("Associated token account already exists: {:?}", reward_vault_ata);
    }

    league.creator = ctx.accounts.creator.key();
    league.markets = markets;
    league.start_ts = start_ts;
    league.end_ts = end_ts;

    league.entry_token_mint = ctx.accounts.entry_token_mint.key();
    league.entry_amount = entry_amount;

    league.reward_vault = ctx.accounts.reward_vault.key();
    league.metadata_uri = metadata_uri;
    league.is_closed = false;
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
    space = 8 + 32 + 32 + 8 + 1 + 1,
    seeds = [b"league_member_deposit", league.key().as_ref(), user.key().as_ref()],
    bump
    )]
    pub user_deposit: Account<'info, LeagueMemberDeposit>,

    /// CHECK: Reward vault ATA for transfer entry token to the league
    #[account(mut)]
    pub reward_vault: UncheckedAccount<'info>,

    /// CHECK: Entry token mint
    pub entry_token_mint: Account<'info, Mint>,

    /// CHECK: User entry ATA for transfer entry token to the league
    #[account(mut)]
    pub user_entry_ata: UncheckedAccount<'info>,

    /// CHECK: League reward vault ATA for transfer entry token to the league
    #[account(mut)]
    pub vault_entry_ata: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn join_league(ctx: Context<JoinLeague>, amount: u64) -> Result<()> {
  let league = &ctx.accounts.league;
  require!(!league.is_closed, crate::errors::ErrorCode::LeagueAlreadyClosed);
  require!(amount >= league.entry_amount, crate::errors::ErrorCode::InsufficientEntryAmount);
  require_keys_eq!(league.entry_token_mint, ctx.accounts.entry_token_mint.key());

  let deposit = &mut ctx.accounts.user_deposit;
  deposit.league = league.key();
  deposit.user = ctx.accounts.user.key();
  deposit.amount = amount;
  deposit.claimed = false;

  let cpi_accounts = Transfer {
    from: ctx.accounts.user_entry_ata.to_account_info(),
    to: ctx.accounts.vault_entry_ata.to_account_info(),
    authority: ctx.accounts.user.to_account_info(),
  };
  let cpi_ctx = CpiContext::new(
    ctx.accounts.token_program.to_account_info(),
    cpi_accounts,
  );
  anchor_spl::token::transfer(cpi_ctx, amount)?;

  msg!("User joined league: {:?}", league.key());
  Ok(())
}
