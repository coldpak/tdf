import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tdf } from "../target/types/tdf";
import { expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";

describe("TDF Performance Tests", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.tdf as Program<Tdf>;
  const provider = anchor.getProvider();

  // Test accounts
  let admin: Keypair;
  let users: Keypair[];
  let treasury: Keypair;
  let permissionProgram: Keypair;
  let entryTokenMint: PublicKey;

  // PDAs
  let globalStatePDA: PublicKey;
  let leaguePDA: PublicKey;
  let marketPDA: PublicKey;
  let rewardVaultPDA: PublicKey;
  let userDepositPDA: PublicKey;

  before(async () => {
    // Initialize test accounts
    admin = Keypair.generate();
    treasury = Keypair.generate();
    permissionProgram = Keypair.generate();

    // Generate multiple users for performance testing
    users = Array.from({ length: 10 }, () => Keypair.generate());

    // Airdrop SOL to test accounts
    await provider.connection.requestAirdrop(admin.publicKey, 20 * anchor.web3.LAMPORTS_PER_SOL);
    
    for (const user of users) {
      await provider.connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    }

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

    // Initialize global state
    await program.methods
      .initializeGlobalState(100, treasury.publicKey, permissionProgram.publicKey)
      .accounts({
        globalState: globalStatePDA,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
  });

  describe("Transaction Performance", () => {
    it("Should measure global state initialization performance", async () => {
      const startTime = Date.now();
      
      // This test measures the time for a simple global state initialization
      // (Note: This will fail since global state is already initialized, but we measure the error handling)
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
      } catch (error) {
        // Expected to fail
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Global state initialization error handling took: ${duration}ms`);
      expect(duration).to.be.lessThan(5000); // Should be fast even for error cases
    });

    it("Should measure market listing performance", async () => {
      const oracleFeed = Keypair.generate();
      const baseCurrency = Keypair.generate();
      const symbol = Buffer.from("PERF/USDC".padEnd(16, "\0"));
      const decimals = 6;
      const createdAt = Math.floor(Date.now() / 1000);

      [marketPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), oracleFeed.publicKey.toBuffer()],
        program.programId
      );

      const startTime = Date.now();
      
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

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Market listing took: ${duration}ms`);
      console.log(`Transaction signature: ${tx}`);
      expect(duration).to.be.lessThan(10000); // Should complete within 10 seconds
    });

    it("Should measure league creation performance", async () => {
      const startTs = Math.floor(Date.now() / 1000) + 3600;
      const endTs = startTs + 86400;
      const entryAmount = new anchor.BN(1000000);
      const markets: PublicKey[] = [];
      const metadataUri = "https://example.com/performance-league";

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

      const startTime = Date.now();
      
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

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`League creation took: ${duration}ms`);
      console.log(`Transaction signature: ${tx}`);
      expect(duration).to.be.lessThan(15000); // Should complete within 15 seconds
    });
  });

  describe("Bulk Operations Performance", () => {
    it("Should measure bulk league joining performance", async () => {
      const entryAmount = new anchor.BN(1000000);
      const joinOperations = [];
      const startTime = Date.now();

      // Create token accounts and mint tokens for all users
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const userTokenAccount = await createAccount(
          provider.connection,
          user,
          entryTokenMint,
          user.publicKey
        );

        await mintTo(
          provider.connection,
          admin,
          entryTokenMint,
          userTokenAccount,
          admin,
          10000000 // 10 tokens
        );

        [userDepositPDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("league_member_deposit"),
            leaguePDA.toBuffer(),
            user.publicKey.toBuffer()
          ],
          program.programId
        );

        joinOperations.push(
          program.methods
            .joinLeague(entryAmount)
            .accounts({
              user: user.publicKey,
              league: leaguePDA,
              userDeposit: userDepositPDA,
              rewardVault: rewardVaultPDA,
              entryTokenMint: entryTokenMint,
              userEntryAta: userTokenAccount,
              vaultEntryAta: rewardVaultPDA,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc()
        );
      }

      // Execute all join operations
      const results = await Promise.allSettled(joinOperations);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const successful = results.filter(result => result.status === 'fulfilled').length;
      const failed = results.filter(result => result.status === 'rejected').length;
      
      console.log(`Bulk league joining (${users.length} users) took: ${duration}ms`);
      console.log(`Successful: ${successful}, Failed: ${failed}`);
      console.log(`Average time per user: ${duration / users.length}ms`);
      
      expect(duration).to.be.lessThan(60000); // Should complete within 60 seconds
      expect(successful).to.be.greaterThan(0); // At least some should succeed
    });

    it("Should measure sequential vs parallel operations", async () => {
      const numOperations = 5;
      const startTs = Math.floor(Date.now() / 1000) + 3600;
      
      // Sequential operations
      const sequentialStart = Date.now();
      for (let i = 0; i < numOperations; i++) {
        const currentStartTs = startTs + i;
        const endTs = currentStartTs + 86400;
        const entryAmount = new anchor.BN(1000000);
        const markets: PublicKey[] = [];
        const metadataUri = `https://example.com/sequential-league-${i}`;

        [leaguePDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("league"),
            admin.publicKey.toBuffer(),
            Buffer.from(currentStartTs.toString().padStart(8, "0"))
          ],
          program.programId
        );

        [rewardVaultPDA] = PublicKey.findProgramAddressSync(
          [leaguePDA.toBuffer(), entryTokenMint.toBuffer()],
          new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
        );

        try {
          await program.methods
            .createLeague(
              new anchor.BN(currentStartTs),
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
        } catch (error) {
          // Some may fail due to duplicate PDAs
        }
      }
      const sequentialEnd = Date.now();
      const sequentialDuration = sequentialEnd - sequentialStart;

      // Parallel operations
      const parallelStart = Date.now();
      const parallelOperations = [];
      for (let i = 0; i < numOperations; i++) {
        const currentStartTs = startTs + 1000 + i;
        const endTs = currentStartTs + 86400;
        const entryAmount = new anchor.BN(1000000);
        const markets: PublicKey[] = [];
        const metadataUri = `https://example.com/parallel-league-${i}`;

        [leaguePDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("league"),
            admin.publicKey.toBuffer(),
            Buffer.from(currentStartTs.toString().padStart(8, "0"))
          ],
          program.programId
        );

        [rewardVaultPDA] = PublicKey.findProgramAddressSync(
          [leaguePDA.toBuffer(), entryTokenMint.toBuffer()],
          new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
        );

        parallelOperations.push(
          program.methods
            .createLeague(
              new anchor.BN(currentStartTs),
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
            .rpc()
        );
      }

      await Promise.allSettled(parallelOperations);
      const parallelEnd = Date.now();
      const parallelDuration = parallelEnd - parallelStart;

      console.log(`Sequential operations (${numOperations}) took: ${sequentialDuration}ms`);
      console.log(`Parallel operations (${numOperations}) took: ${parallelDuration}ms`);
      console.log(`Performance improvement: ${((sequentialDuration - parallelDuration) / sequentialDuration * 100).toFixed(2)}%`);
      
      expect(parallelDuration).to.be.lessThan(sequentialDuration); // Parallel should be faster
    });
  });

  describe("Memory and Resource Usage", () => {
    it("Should handle large data structures efficiently", async () => {
      const startTime = Date.now();
      
      // Create a league with maximum allowed markets (10)
      const startTs = Math.floor(Date.now() / 1000) + 3600;
      const endTs = startTs + 86400;
      const entryAmount = new anchor.BN(1000000);
      
      // Create 10 market PDAs
      const markets: PublicKey[] = [];
      for (let i = 0; i < 10; i++) {
        const oracleFeed = Keypair.generate();
        [marketPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("market"), oracleFeed.publicKey.toBuffer()],
          program.programId
        );
        markets.push(marketPDA);
      }
      
      const metadataUri = "https://example.com/large-data-league";

      [leaguePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("league"),
          admin.publicKey.toBuffer(),
          Buffer.from((startTs + 2000).toString().padStart(8, "0"))
        ],
          program.programId
      );

      [rewardVaultPDA] = PublicKey.findProgramAddressSync(
        [leaguePDA.toBuffer(), entryTokenMint.toBuffer()],
        new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
      );

      try {
        const tx = await program.methods
          .createLeague(
            new anchor.BN(startTs + 2000),
            new anchor.BN(endTs + 2000),
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

        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log(`Large data structure handling took: ${duration}ms`);
        console.log(`Transaction signature: ${tx}`);
        
        // Verify the league was created with all markets
        const league = await program.account.league.fetch(leaguePDA);
        expect(league.markets.length).to.equal(10);
        
        expect(duration).to.be.lessThan(20000); // Should handle large data efficiently
      } catch (error) {
        console.log("Large data structure test failed:", error.message);
      }
    });

    it("Should measure account creation costs", async () => {
      const startTime = Date.now();
      
      // Create multiple accounts to measure cost
      const numAccounts = 5;
      const accountCreations = [];
      
      for (let i = 0; i < numAccounts; i++) {
        const startTs = Math.floor(Date.now() / 1000) + 3600 + (i * 100);
        const endTs = startTs + 86400;
        const entryAmount = new anchor.BN(1000000);
        const markets: PublicKey[] = [];
        const metadataUri = `https://example.com/cost-test-league-${i}`;

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

        accountCreations.push(
          program.methods
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
            .rpc()
        );
      }

      const results = await Promise.allSettled(accountCreations);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const successful = results.filter(result => result.status === 'fulfilled').length;
      
      console.log(`Account creation for ${numAccounts} accounts took: ${duration}ms`);
      console.log(`Successful creations: ${successful}`);
      console.log(`Average time per account: ${duration / numAccounts}ms`);
      
      expect(duration).to.be.lessThan(30000); // Should be reasonable
      expect(successful).to.be.greaterThan(0);
    });
  });
});
