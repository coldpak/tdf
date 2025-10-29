use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::{League, Leaderboard, Participant, LeagueStatus};

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(mut)]
    pub league: Account<'info, League>,

    #[account(
        mut,
        seeds = [b"leaderboard", league.key().as_ref()],
        bump = leaderboard.bump
    )]
    pub leaderboard: Account<'info, Leaderboard>,

    #[account(
        mut,
        seeds = [b"participant", league.key().as_ref(), participant.user.key().as_ref()],
        bump = participant.bump
    )]
    pub participant: Account<'info, Participant>,

    #[account(mut)]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub participant_ata: Account<'info, TokenAccount>,

    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
    let league = &ctx.accounts.league;
    let leaderboard = &ctx.accounts.leaderboard;
    let participant = &mut ctx.accounts.participant;

    require!(
        league.status == LeagueStatus::Closed,
        crate::errors::ErrorCode::LeagueNotClosed
    );
    require!(!participant.claimed, crate::errors::ErrorCode::AlreadyClaimed);

    let participant_key = participant.key();
    let topk_equity = &leaderboard.topk_equity;

    // Check if the participant is in the top k
    let maybe_index = topk_equity
        .iter()
        .position(|p| p == &participant_key)
        .ok_or(crate::errors::ErrorCode::NotInTopK)?;

    // Calculate weight based on ranking
    let k = leaderboard.k as usize;
    let total_weight: u64 = (1..=k as u64).sum();
    let weight = (k - maybe_index) as u64;

    let total_reward = league.total_reward_amount;
    let share = total_reward * weight / total_weight;

    // PDA signer seeds (league authority)
    let seeds = &[
        b"league",
        league.creator.as_ref(),
        &[league.nonce],
        &[league.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.reward_vault.to_account_info(),
            to: ctx.accounts.participant_ata.to_account_info(),
            authority: ctx.accounts.league.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi_ctx, share)?;

    participant.claimed = true;
    msg!("✅ {:?} claimed {} tokens", participant_key, share);

    Ok(())
}
