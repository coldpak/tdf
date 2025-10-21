import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tdf } from "../target/types/tdf";

import { expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getAccount } from "@solana/spl-token";

describe("TDF Program Tests", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.tdf as Program<Tdf>;
  const provider = anchor.getProvider();

  // Test accounts
  let admin: Keypair;
  let user1: Keypair;
  let user2: Keypair;
  let treasury: Keypair;
  let permissionProgram: Keypair;
  let oracleFeed: Keypair;
  let baseCurrency: Keypair;
  let entryTokenMint: PublicKey;
  let entryTokenMintKeypair: Keypair;

  // PDAs
  let globalStatePDA: PublicKey;
  let marketPDA: PublicKey;
  let leaguePDA: PublicKey;
  let userDepositPDA: PublicKey;
  let rewardVaultPDA: PublicKey;

  before(async () => {
    // Initialize test accounts
    admin = Keypair.generate();
    user1 = Keypair.generate();
    user2 = Keypair.generate();
    treasury = Keypair.generate();
    permissionProgram = Keypair.generate();
    oracleFeed = Keypair.generate();
    baseCurrency = Keypair.generate();
    entryTokenMintKeypair = Keypair.generate();

    // Airdrop SOL to test accounts
    await provider.connection.requestAirdrop(admin.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(user1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(user2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(treasury.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);

    // Create entry token mint
    entryTokenMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6
    );

    // Calculate PDAs
    [globalStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_state")],
      program.programId
    );
  });

  describe("Global State Initialization", () => {
    it("Should initialize global state successfully", async () => {
      const feeBps = 100; // 1%
      
      const tx = await program.methods
        .initializeGlobalState(feeBps, treasury.publicKey, permissionProgram.publicKey)
        .accounts({
          globalState: globalStatePDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      console.log("Global state initialization tx:", tx);

      // Verify global state
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      expect(globalState.admin.toString()).to.equal(admin.publicKey.toString());
      expect(globalState.feeBps).to.equal(feeBps);
      expect(globalState.treasury.toString()).to.equal(treasury.publicKey.toString());
      expect(globalState.permissionProgram.toString()).to.equal(permissionProgram.publicKey.toString());
    });

    it("Should fail to initialize global state twice", async () => {
      try {
        await program.methods
          .initializeGlobalState(100, treasury.publicKey, permissionProgram.publicKey)
          .accounts({
            globalState: globalStatePDA,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        
        expect.fail("Should have failed");
      } catch (error) {
        expect(error.message).to.include("already in use");
      }
    });
  });

  describe("Market Listing", () => {
    it("Should list a market successfully", async () => {
      const symbol = Buffer.from("SOL/USDC".padEnd(16, "\0"));
      const decimals = 6;
      const createdAt = Math.floor(Date.now() / 1000);

      [marketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), oracleFeed.publicKey.toBuffer()],
        program.programId
      );

      const tx = await program.methods
        .listMarket(symbol, decimals, new anchor.BN(createdAt))
        .accounts({
          globalState: globalStatePDA,
          market: marketPDA,
          oracleFeed: oracleFeed.publicKey,
          baseCurrency: baseCurrency.publicKey,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      console.log("Market listing tx:", tx);

      // Verify market
      const market = await program.account.market.fetch(marketPDA);
      expect(Array.from(market.symbol)).to.deep.equal(Array.from(symbol));
      expect(market.decimals).to.equal(decimals);
      expect(market.oracleFeed.toString()).to.equal(oracleFeed.publicKey.toString());
      expect(market.baseCurrency.toString()).to.equal(baseCurrency.publicKey.toString());
      expect(market.listedBy.toString()).to.equal(admin.publicKey.toString());
      expect(market.isActive).to.be.true;
      expect(market.createdAt.toNumber()).to.equal(createdAt);
    });

    it("Should fail to list market with non-admin", async () => {
      const symbol = Buffer.from("ETH/USDC".padEnd(16, "\0"));
      const decimals = 6;
      const createdAt = Math.floor(Date.now() / 1000);

      try {
        await program.methods
          .listMarket(symbol, decimals, new anchor.BN(createdAt))
          .accounts({
            globalState: globalStatePDA,
            market: marketPDA,
            oracleFeed: oracleFeed.publicKey,
            baseCurrency: baseCurrency.publicKey,
            admin: user1.publicKey, // Non-admin user
            systemProgram: SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
        
        expect.fail("Should have failed");
      } catch (error) {
        expect(error.message).to.include("constraint");
      }
    });
  });

  describe("League Creation", () => {
    it("Should create a league successfully", async () => {
      const startTs = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const endTs = startTs + 86400; // 24 hours later
      const entryAmount = new anchor.BN(1000000); // 1 token (6 decimals)
      const markets = [marketPDA];
      const metadataUri = "https://example.com/league-metadata";

      [leaguePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("league"),
          admin.publicKey.toBuffer(),
          Buffer.from(startTs.toString().padStart(8, "0"))
        ],
        program.programId
      );

      [rewardVaultPDA] = PublicKey.findProgramAddressSync(
        [leaguePDA.toBuffer(), entryTokenMint.toBuffer()],
        new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
      );

      const tx = await program.methods
        .createLeague(
          new anchor.BN(startTs),
          new anchor.BN(endTs),
          entryAmount,
          markets,
          metadataUri
        )
        .accounts({
          creator: admin.publicKey,
          league: leaguePDA,
          entryTokenMint: entryTokenMint,
          rewardVault: rewardVaultPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
        })
        .signers([admin])
        .rpc();

      console.log("League creation tx:", tx);

      // Verify league
      const league = await program.account.league.fetch(leaguePDA);
      expect(league.creator.toString()).to.equal(admin.publicKey.toString());
      expect(league.markets.length).to.equal(1);
      expect(league.markets[0].toString()).to.equal(marketPDA.toString());
      expect(league.startTs.toNumber()).to.equal(startTs);
      expect(league.endTs.toNumber()).to.equal(endTs);
      expect(league.entryTokenMint.toString()).to.equal(entryTokenMint.toString());
      expect(league.entryAmount.toString()).to.equal(entryAmount.toString());
      expect(league.rewardVault.toString()).to.equal(rewardVaultPDA.toString());
      expect(league.metadataUri).to.equal(metadataUri);
      expect(league.isClosed).to.be.false;
    });
  });

  describe("League Joining", () => {
    it("Should allow user to join league", async () => {
      const amount = new anchor.BN(1000000); // 1 token

      [userDepositPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("league_member_deposit"),
          leaguePDA.toBuffer(),
          user1.publicKey.toBuffer()
        ],
        program.programId
      );

      // Create user's token account and mint tokens
      const userTokenAccount = await createAccount(
        provider.connection,
        user1,
        entryTokenMint,
        user1.publicKey
      );

      await mintTo(
        provider.connection,
        admin,
        entryTokenMint,
        userTokenAccount,
        admin,
        10000000 // 10 tokens
      );

      const tx = await program.methods
        .joinLeague(amount)
        .accounts({
          user: user1.publicKey,
          league: leaguePDA,
          userDeposit: userDepositPDA,
          rewardVault: rewardVaultPDA,
          entryTokenMint: entryTokenMint,
          userEntryAta: userTokenAccount,
          vaultEntryAta: rewardVaultPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      console.log("Join league tx:", tx);

      // Verify user deposit
      const userDeposit = await program.account.leagueMemberDeposit.fetch(userDepositPDA);
      expect(userDeposit.league.toString()).to.equal(leaguePDA.toString());
      expect(userDeposit.user.toString()).to.equal(user1.publicKey.toString());
      expect(userDeposit.amount.toString()).to.equal(amount.toString());
      expect(userDeposit.claimed).to.be.false;
    });

    it("Should fail to join league with insufficient amount", async () => {
      const insufficientAmount = new anchor.BN(500000); // 0.5 token (less than required)

      [userDepositPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("league_member_deposit"),
          leaguePDA.toBuffer(),
          user2.publicKey.toBuffer()
        ],
        program.programId
      );

      // Create user's token account and mint tokens
      const userTokenAccount = await createAccount(
        provider.connection,
        user2,
        entryTokenMint,
        user2.publicKey
      );

      await mintTo(
        provider.connection,
        admin,
        entryTokenMint,
        userTokenAccount,
        admin,
        10000000 // 10 tokens
      );

      try {
        await program.methods
          .joinLeague(insufficientAmount)
          .accounts({
            user: user2.publicKey,
            league: leaguePDA,
            userDeposit: userDepositPDA,
            rewardVault: rewardVaultPDA,
            entryTokenMint: entryTokenMint,
            userEntryAta: userTokenAccount,
            vaultEntryAta: rewardVaultPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user2])
          .rpc();
        
        expect.fail("Should have failed");
      } catch (error) {
        expect(error.message).to.include("InsufficientEntryAmount");
      }
    });
  });

  describe("Integration Tests", () => {
    it("Should complete full workflow: initialize -> list market -> create league -> join league", async () => {
      console.log("Full workflow test completed successfully");
      
      // Verify final states
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      const market = await program.account.market.fetch(marketPDA);
      const league = await program.account.league.fetch(leaguePDA);
      const userDeposit = await program.account.leagueMemberDeposit.fetch(userDepositPDA);

      expect(globalState.admin.toString()).to.equal(admin.publicKey.toString());
      expect(market.isActive).to.be.true;
      expect(league.isClosed).to.be.false;
      expect(userDeposit.claimed).to.be.false;

      console.log("All states verified successfully");
    });
  });
});
