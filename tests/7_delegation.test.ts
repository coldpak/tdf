/// e2e로 테스트 짜기 + 앞으로 개발 남은 태스크
/// 1. leaderboard delegation 잘 되는지 확인
/// 2. participant join 할때, delegation 만들기
/// 3. position open 할때, delegation close 될 때 undelegation 만들기
/// 4. refresh participant
/// 5. claim reward 할 때, undelegation 만들기
import * as anchor from "@coral-xyz/anchor";
import { DELEGATION_PROGRAM_ID, GetCommitmentSignature } from "@magicblock-labs/ephemeral-rollups-sdk";
import {
  getAccounts,
  getOracleProgram,
  getPDAs,
  getProgram,
  globalTestState,
  TEST_CONFIG,
} from "./0_global-setup";
import { TestHelpers } from "./helpers";
import { expect } from "chai";

describe.only("tdf delegation", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

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

  let testHelpers: TestHelpers;
  let accounts: any;
  let pdas: any;
  let marketPDA: any;
  let leaguePDA: any;
  let leaderboardPDA: any;
  let participantPDA: any;
  let nonce: number = 0;

  before(async function () {
    await globalTestState.initialize();
    accounts = getAccounts();
    pdas = getPDAs();
    marketPDA = globalTestState.createMarketPDA(accounts.oracleFeed.publicKey);
    testHelpers = new TestHelpers(
      getProgram(),
      getOracleProgram(),
      accounts,
      pdas
    );
  });

  it("Create league on Solana", async () => {
    const startTs = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION; // 24 hours later
    const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
    const markets = [marketPDA];
    const metadataUri = `https://example.com/league-metadata`;
    const maxParticipants = 100;
    const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
    const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;

    leaguePDA = globalTestState.createLeaguePDA(
      accounts.admin.publicKey,
      nonce
    );
    leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);

    const { leaguePDA: tx } = await testHelpers.createLeague(
      accounts.admin,
      startTs,
      endTs,
      entryAmount,
      markets,
      leaderboardPDA,
      metadataUri,
      maxParticipants,
      virtualOnDeposit,
      maxLeverage,
      nonce
    );
    console.log("✅ League creation tx:", tx);
  });

  it("Start league and delegate leaderboard to ER", async () => {
    // Add local validator identity to the remaining accounts if running on localnet
    // const remainingAccounts =
    //   providerEphemeralRollup.connection.rpcEndpoint.includes("localhost") ||
    //   providerEphemeralRollup.connection.rpcEndpoint.includes("127.0.0.1")
    //     ? [
    //         {
    //           pubkey: new web3.PublicKey(
    //             "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev"
    //           ),
    //           isSigner: false,
    //           isWritable: false,
    //         },
    //       ]
    //     : [];

    await testHelpers.startLeague(leaguePDA, leaderboardPDA, accounts.admin);
    // check leaderboard account's owner is DelegationProgramId
    const leaderboardAccount = await provider.connection.getAccountInfo(leaderboardPDA);
    console.log("Leaderboard Account:", leaderboardAccount);
    expect(leaderboardAccount?.owner?.toString()).to.equal(DELEGATION_PROGRAM_ID.toString());
  });

  // it("Increase counter on ER", async () => {
  //   const start = Date.now();
  //   let tx = await program.methods
  //     .increment()
  //     .accounts({
  //       counter: pda,
  //     })
  //     .transaction();
  //   tx.feePayer = providerEphemeralRollup.wallet.publicKey;
  //   tx.recentBlockhash = (
  //     await providerEphemeralRollup.connection.getLatestBlockhash()
  //   ).blockhash;
  //   tx = await providerEphemeralRollup.wallet.signTransaction(tx);
  //   const txHash = await providerEphemeralRollup.sendAndConfirm(tx);
  //   const duration = Date.now() - start;
  //   console.log(`${duration}ms (ER) Increment txHash: ${txHash}`);
  // });

  // it("Commit counter state on ER to Solana", async () => {
  //   const start = Date.now();
  //   let tx = await program.methods
  //     .commit()
  //     .accounts({
  //       payer: providerEphemeralRollup.wallet.publicKey,
  //     })
  //     .transaction();
  //   tx.feePayer = providerEphemeralRollup.wallet.publicKey;
  //   tx.recentBlockhash = (
  //     await providerEphemeralRollup.connection.getLatestBlockhash()
  //   ).blockhash;
  //   tx = await providerEphemeralRollup.wallet.signTransaction(tx);

  //   const txHash = await providerEphemeralRollup.sendAndConfirm(tx, [], {
  //     skipPreflight: true,
  //   });
  //   const duration = Date.now() - start;
  //   console.log(`${duration}ms (ER) Commit txHash: ${txHash}`);

  //   // Get the commitment signature on the base layer
  //   const comfirmCommitStart = Date.now();
  //   // Await for the commitment on the base layer
  //   const txCommitSgn = await GetCommitmentSignature(
  //     txHash,
  //     providerEphemeralRollup.connection
  //   );
  //   const commitDuration = Date.now() - comfirmCommitStart;
  //   console.log(
  //     `${commitDuration}ms (Base Layer) Commit txHash: ${txCommitSgn}`
  //   );
  // });

  // it("Increase counter on ER and commit", async () => {
  //   const start = Date.now();
  //   let tx = await program.methods
  //     .incrementAndCommit()
  //     .accounts({})
  //     .transaction();
  //   tx.feePayer = providerEphemeralRollup.wallet.publicKey;
  //   tx.recentBlockhash = (
  //     await providerEphemeralRollup.connection.getLatestBlockhash()
  //   ).blockhash;
  //   tx = await providerEphemeralRollup.wallet.signTransaction(tx);
  //   const txHash = await providerEphemeralRollup.sendAndConfirm(tx);
  //   const duration = Date.now() - start;
  //   console.log(`${duration}ms (ER) Increment and Commit txHash: ${txHash}`);
  // });

  // it("Increment and undelegate counter on ER to Solana", async () => {
  //   const start = Date.now();
  //   let tx = await program.methods
  //     .incrementAndUndelegate()
  //     .accounts({
  //       payer: providerEphemeralRollup.wallet.publicKey,
  //     })
  //     .transaction();
  //   tx.feePayer = provider.wallet.publicKey;
  //   tx.recentBlockhash = (
  //     await providerEphemeralRollup.connection.getLatestBlockhash()
  //   ).blockhash;
  //   tx = await providerEphemeralRollup.wallet.signTransaction(tx);

  //   const txHash = await providerEphemeralRollup.sendAndConfirm(tx);
  //   const duration = Date.now() - start;
  //   console.log(
  //     `${duration}ms (ER) Increment and Undelegate txHash: ${txHash}`
  //   );
  // });
});
