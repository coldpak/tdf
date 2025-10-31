import * as anchor from "@coral-xyz/anchor";
import { Keypair, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, web3 } from "@coral-xyz/anchor";
import { Tdf } from "../target/types/tdf";
import BN from "bn.js";
import {
  createMint,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Oracle } from "../target/types/oracle";
import { expect } from "chai";
import {
  ConnectionMagicRouter,
  MAGIC_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
} from "@magicblock-labs/ephemeral-rollups-sdk";

describe("TDF", () => {
  // Configure the client
  let provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  let program = anchor.workspace.tdf as Program<Tdf>;
  console.log("Program ID: ", program.programId.toString());

  const ER_VALIDATOR = new anchor.web3.PublicKey(
    "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev"
  );
  const admin = anchor.Wallet.local();
  const user1 = anchor.web3.Keypair.generate();
  const user2 = anchor.web3.Keypair.generate();

  let entryTokenMint: anchor.web3.PublicKey;
  let marketPDA: anchor.web3.PublicKey;
  let leaguePDA: anchor.web3.PublicKey;
  let leaderboardPDA: anchor.web3.PublicKey;
  let rewardVaultAta: anchor.web3.PublicKey;

  const providerEphemeralRollup = new anchor.AnchorProvider(
    new anchor.web3.Connection(
      process.env.EPHEMERAL_PROVIDER_ENDPOINT ||
        "https://devnet-as.magicblock.app/",
      {
        wsEndpoint:
          process.env.EPHEMERAL_WS_ENDPOINT ||
          "wss://devnet-as.magicblock.app/",
      }
    ),
    anchor.Wallet.local()
  );
  console.log("Base Layer Connection: ", provider.connection.rpcEndpoint);
  console.log(
    "Ephemeral Rollup Connection: ",
    providerEphemeralRollup.connection.rpcEndpoint
  );
  console.log(`Current SOL Public Key: ${anchor.Wallet.local().publicKey}`);

  before(async () => {
    // Create Entry Token Mint
    entryTokenMint = await createMint(
      provider.connection,
      admin.payer,
      admin.publicKey,
      null,
      6
    );
    console.log("Entry Token Mint Created:", entryTokenMint.toString());

    // Create Oracle Feed
    const oracleProgram = anchor.workspace.oracle as Program<Oracle>;
    const priceFeedPDA = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("price_feed")],
      oracleProgram.programId
    );
    try {
      const oracleFeed = await oracleProgram.methods
        .initializePriceFeed(new BN(100000000))
        .accounts({
          priceFeed: priceFeedPDA,
          authority: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([admin.payer])
        .rpc();
      console.log("Oracle Feed Created:", oracleFeed.toString());
    } catch (error) {
      if (error.message.includes("already in use")) {
        console.log("Oracle Feed already exists");
      } else {
        throw error;
      }
    }

    [marketPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from("SOL/USDC")],
      program.programId
    );
    console.log("Market PDA:", marketPDA.toString());

    [leaguePDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("league"), admin.publicKey.toBuffer(), Buffer.from([0])],
      program.programId
    );
    console.log("League PDA:", leaguePDA.toString());

    rewardVaultAta = getAssociatedTokenAddressSync(
      entryTokenMint,
      leaguePDA,
      true
    );
    console.log("Reward Vault Ata:", rewardVaultAta.toString());

    [leaderboardPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("leaderboard"), leaguePDA.toBuffer()],
      program.programId
    );
    console.log("Leaderboard PDA:", leaderboardPDA.toString());
  });

  // it("Create League", async () => {
  //   console.log("Creating League...");
  //   const startTs = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  //   const endTs = startTs + 86400; // 24 hours later
  //   const entryAmount = new anchor.BN(1000000); // 1 token (6 decimals)
  //   const markets = [marketPDA];
  //   const metadataUri = "https://example.com/league-metadata";
  //   const maxParticipants = 100;
  //   const virtualOnDeposit = new anchor.BN(1000000000); // 1 billion (1e9)
  //   const maxLeverage = 20;
  //   const nonce = 0;
  //   const k = 50;

  //   try {
  //     let createLeagueTx = await program.methods
  //       .createLeague(
  //         new anchor.BN(startTs),
  //         new anchor.BN(endTs),
  //         entryAmount,
  //         markets,
  //         metadataUri,
  //         maxParticipants,
  //         virtualOnDeposit,
  //         maxLeverage,
  //         nonce,
  //         k
  //       )
  //       .accounts({
  //         creator: admin.publicKey,
  //         league: leaguePDA,
  //         leaderboard: leaderboardPDA,
  //         entryTokenMint: entryTokenMint,
  //         rewardVault: rewardVaultAta,
  //         systemProgram: anchor.web3.SystemProgram.programId,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  //       } as any)
  //       .signers([admin.payer])
  //       .rpc();
  //     console.log("Create League Tx:", createLeagueTx.toString());
  //   } catch (error: any) {
  //     const logs = error?.logs || error?.simulationResponse?.logs;
  //     if (logs) console.error("Create league logs:\n", logs);
  //     throw error;
  //   }

  //   // Optionally verify league exists
  //   const league = await program.account.league.fetch(leaguePDA);
  //   expect(league.creator.toString()).to.equal(admin.publicKey.toString());
  // });

  // it("Start league", async () => {
  //   console.log("Starting league...");
  //   let startLeagueTx = await program.methods
  //     .startLeague()
  //     .accounts({
  //       payer: admin.publicKey,
  //       league: leaguePDA,
  //     } as any)
  //     .signers([admin.payer])
  //     .rpc();

  //   console.log("Start League Tx:", startLeagueTx.toString());
  // });

  it("Delegate leaderboard", async () => {
    console.log("Delegate leaderboard...");
    // Add local validator identity to the remaining accounts if running on localnet
    const remainingAccounts =
      providerEphemeralRollup.connection.rpcEndpoint.includes("localhost") ||
      providerEphemeralRollup.connection.rpcEndpoint.includes("127.0.0.1")
        ? [
            {
              pubkey: new web3.PublicKey("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev"),
              isSigner: false,
              isWritable: false,
            },
          ]
        : [];

    console.log("Remaining accounts:", remainingAccounts);
    try {
      let delegateLeaderboardTx = await program.methods
        .delegateLeaderboard(leaguePDA)
        .accounts({
          payer: admin.publicKey,
          pda: leaderboardPDA,
        } as any)
        .signers([admin.payer])
        .rpc();
      console.log(
        "Delegate Leaderboard Tx:",
        delegateLeaderboardTx.toString()
      );
    } catch (error: any) {
      // Attempt to surface simulation logs from SendTransactionError/Anchor error
      const logs = error?.logs || error?.simulationResponse?.logs;
      if (logs) {
        console.error("Transaction simulation logs:\n", logs);
      } else if (error?.message) {
        console.error("Delegate leaderboard failed:", error.message);
      }
      throw error;
    }
  });

  it("Commit leaderboard", async () => {
    console.log("Commit leaderboard...");
    let commitLeaderboardTx = await program.methods
      .commitLeaderboard(leaguePDA)
      .accounts({
        payer: admin.publicKey,
        leaderboard: leaderboardPDA,
        magicContext: MAGIC_CONTEXT_ID,
        magicProgram: MAGIC_PROGRAM_ID,
      } as any)
      .transaction();

    commitLeaderboardTx.feePayer = providerEphemeralRollup.wallet.publicKey;
    commitLeaderboardTx.recentBlockhash = (
      await providerEphemeralRollup.connection.getLatestBlockhash()
    ).blockhash;
    commitLeaderboardTx = await providerEphemeralRollup.wallet.signTransaction(
      commitLeaderboardTx
    );
    const sig = await providerEphemeralRollup.sendAndConfirm(
      commitLeaderboardTx
    );
    console.log("Commit Leaderboard Tx:", sig);
  });

  it("Undelegate leaderboard", async () => {
    console.log("Undelegate leaderboard...");
    let undelegateLeaderboardTx = await program.methods
      .undelegateLeaderboard(leaguePDA)
      .accounts({
        leaderboard: leaderboardPDA,
        league: leaguePDA,
        payer: providerEphemeralRollup.wallet.publicKey,
        magicContext: MAGIC_CONTEXT_ID,
        magicProgram: MAGIC_PROGRAM_ID,
      } as any)
      .transaction();

    undelegateLeaderboardTx.feePayer = providerEphemeralRollup.wallet.publicKey;
    undelegateLeaderboardTx.recentBlockhash = (
      await providerEphemeralRollup.connection.getLatestBlockhash()
    ).blockhash;
    undelegateLeaderboardTx =
      await providerEphemeralRollup.wallet.signTransaction(
        undelegateLeaderboardTx
      );

    const sig = await providerEphemeralRollup.sendAndConfirm(
      undelegateLeaderboardTx
    );
    console.log("Undelegate Leaderboard Tx:", sig);
  });
});
