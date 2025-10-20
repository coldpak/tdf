use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;
pub mod errors;

declare_id!("3jFHqM7VCceGLftStfrhLHHKRHBJZyteYuA5c63HXjuY");

#[program]
pub mod tdf {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
