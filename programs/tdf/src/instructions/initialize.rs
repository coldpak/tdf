use anchor_lang::prelude::*;
use crate::state::GlobalState;

#[derive(Accounts)]
pub struct InitializeGlobalState<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 2 + 32 + 32 + 1,
        seeds = [b"global_state"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn initialize_global_state(
    ctx: Context<InitializeGlobalState>,
    fee_bps: u16,
    treasury: Pubkey,
    permission_program: Pubkey,
) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    let bump = ctx.bumps.global_state;
    
    global_state.admin = ctx.accounts.admin.key();
    global_state.fee_bps = fee_bps;
    global_state.treasury = treasury;
    global_state.permission_program = permission_program;
    global_state.bump = bump;
    
    msg!("Global state initialized with admin: {:?}", global_state.admin);
    Ok(())
}
