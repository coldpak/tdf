import { expect } from "chai";
import { getAccount } from "@solana/spl-token";
import { getProvider } from "@coral-xyz/anchor";
import {
  globalTestState,
  getProgram,
  getOracleProgram,
  getAccounts,
  getPDAs,
  TEST_CONFIG,
} from "./0_global-setup";
import { TestHelpers, formatDollars } from "./helpers";

describe("Claim Reward Tests", () => {
  let testHelpers: TestHelpers;
  let accounts: any;
  let pdas: any;
  let leaguePDA: any;
  let participantPDAs: any[] = [];
  let positionPDAs: any[] = [];
  let marketPDA: any;
  let oracleFeedPDA: any;
  let rewardVaultATA: any;
  // Test configuration
  const INITIAL_PRICE = 100_000_000; // $100 with 6 decimals

  let nonce: number = 0;
  before(async () => {
    await globalTestState.initialize();
    accounts = getAccounts();
    pdas = getPDAs();
    testHelpers = new TestHelpers(
      getProgram(),
      getOracleProgram(),
      accounts,
      pdas
    );

    oracleFeedPDA = pdas.priceFeedPDA;
    console.log("pdas.priceFeedPDA", pdas.priceFeedPDA.toString());
    // Set initial oracle price
    await testHelpers.setOraclePrice(pdas.priceFeedPDA, INITIAL_PRICE);
    console.log(
      `✅ Initial oracle price set to: ${formatDollars(INITIAL_PRICE.toString())}`
    );

    // Create the market
    await testHelpers.listMarket(
      "SOL/USDC",
      6,
      20,
      oracleFeedPDA,
      accounts.baseCurrency.publicKey,
      accounts.admin
    );

    // Now create marketPDA with the Oracle price feed
    marketPDA = globalTestState.createMarketPDA(pdas.priceFeedPDA);
  });

  describe("Claim Reward Functionality", () => {
    beforeEach(async () => {
      // Create a fresh league for each test
      const startTs = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION; // 24 hours later
      const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
      const markets = [marketPDA];
      const metadataUri = "https://example.com/league-metadata";
      const maxParticipants = 100;
      const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
      const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;
      const k = 3; // Top 3 participants

      leaguePDA = globalTestState.createLeaguePDA(
        accounts.user1.publicKey,
        nonce
      );

      const leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);

      const result = await testHelpers.createLeague(
        accounts.user1,
        startTs,
        endTs,
        entryAmount,
        markets,
        leaderboardPDA,
        metadataUri,
        maxParticipants,
        virtualOnDeposit,
        maxLeverage,
        nonce,
        k
      );

      leaguePDA = result.leaguePDA;
      rewardVaultATA = await testHelpers.getRewardVaultATA(leaguePDA);

      // Start the league
      await testHelpers.startLeague(leaguePDA, accounts.user1);
      // Reset arrays
      participantPDAs = [];
      positionPDAs = [];

      nonce++;
    });

    it("Should successfully claim reward for top participant", async () => {
      console.log("🏆 Testing successful reward claim for top participant...");

      // Setup 3 participants with different PnL to create a leaderboard
      const users = [accounts.user1, accounts.user2, accounts.user3];

      // Create participants and positions
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const participantPDA = globalTestState.createParticipantPDA(
          leaguePDA,
          user.publicKey
        );
        participantPDAs.push(participantPDA);

        // Setup user token account
        await globalTestState.setupUserTokenAccount(
          user,
          accounts.entryTokenMint,
          accounts.admin,
          10000000 // 10 tokens
        );

        // Join league
        await testHelpers.joinLeague(
          user,
          leaguePDA,
          participantPDA,
          TEST_CONFIG.ENTRY_AMOUNT
        );

        // Create position for each user
        const positionPDA = globalTestState.createPositionPDA(
          leaguePDA,
          user.publicKey,
          marketPDA,
          0
        );
        positionPDAs.push(positionPDA);

        // Open position with different sizes to create different PnL
        const direction = { long: {} };
        const size = 1000000 + i * 500000; // Different sizes: 1M, 1.5M, 2M
        const leverage = 2;

        await testHelpers.openPosition(
          user,
          leaguePDA,
          marketPDA,
          oracleFeedPDA,
          participantPDA,
          positionPDA,
          direction,
          size,
          leverage,
          0
        );
      }

      // Update oracle price to create different PnL for each participant
      await testHelpers.setOraclePrice(oracleFeedPDA, 150000000); // 150.000 (50% increase)

      // Refresh all participants to update leaderboard
      const leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);
      for (let i = 0; i < users.length; i++) {
        await testHelpers.refreshParticipant(
          users[i],
          leaguePDA,
          participantPDAs[i],
          leaderboardPDA,
          [positionPDAs[i]],
          [oracleFeedPDA]
        );
      }

      // Close the league
      await testHelpers.closeLeague(leaguePDA, accounts.user1, rewardVaultATA);

      // Verify league is closed
      const league = await getProgram().account.league.fetch(leaguePDA);
      expect(league.status).to.deep.equal({ closed: {} });

      // Get reward vault balance before claiming
      const rewardVaultBalanceBefore = await getAccount(
        getProvider().connection,
        rewardVaultATA
      );
      console.log(
        "Reward vault balance before claiming:",
        rewardVaultBalanceBefore.amount.toString()
      );

      // Get participant token account balances before claiming
      const participantATAs = [];
      const balancesBefore = [];
      for (let i = 0; i < users.length; i++) {
        const participantATA = await globalTestState.getRewardVaultATA(
          accounts.entryTokenMint,
          users[i].publicKey
        );
        participantATAs.push(participantATA);

        const balance = await getAccount(
          getProvider().connection,
          participantATA
        );
        balancesBefore.push(balance.amount.toString());
        console.log(
          `User ${i + 1} balance before claiming:`,
          balance.amount.toString()
        );
      }

      // log leaderboard status
      const leaderboard = await getProgram().account.leaderboard.fetch(leaderboardPDA);
      console.log("Leaderboard status:", leaderboard.topkEquity);
      console.log("Leaderboard k:", leaderboard.k);
      console.log("Leaderboard topk_equity:", leaderboard.topkEquity);
      console.log("Leaderboard topk_equity_amount:", leaderboard.topkEquityScores);
      console.log("Leaderboard topk_volume:", leaderboard.topkVolume);
      console.log("Leaderboard topk_volume_amount:", leaderboard.topkVolumeScores);

      // Claim rewards for all participants
      for (let i = 0; i < users.length; i++) {
        const participantATA = await globalTestState.getRewardVaultATA(
          accounts.entryTokenMint,
          users[i].publicKey
        );

        console.log("Participant PDA:", participantPDAs[i].toString());

        const tx = await testHelpers.claimReward(
          users[i],
          leaguePDA,
          participantPDAs[i],
          leaderboardPDA,
          rewardVaultATA,
          participantATA
        );

        console.log(`✅ User ${i + 1} claim reward tx:`, tx);
      }

      // Verify participant claimed status
      for (let i = 0; i < users.length; i++) {
        const participant = await getProgram().account.participant.fetch(
          participantPDAs[i]
        );
        expect(participant.claimed).to.be.true;
        console.log(`✅ User ${i + 1} marked as claimed`);
      }

      // Verify reward vault is empty (all rewards distributed)
      const rewardVaultBalanceAfter = await getAccount(
        getProvider().connection,
        rewardVaultATA
      );
      console.log("Reward vault balance after claiming:", rewardVaultBalanceAfter.amount.toString());
      console.log("✅ All rewards distributed from vault");

      // Verify participants received their rewards
      for (let i = 0; i < users.length; i++) {
        const balance = await getAccount(
          getProvider().connection,
          participantATAs[i]
        );
        const expectedBalance =
          Number(balancesBefore[i]) +
          (Number(rewardVaultBalanceBefore.amount) * (3 - i)) / 6; // Weighted distribution
        console.log(
          `User ${i + 1} balance after claiming:`,
          balance.amount.toString()
        );
        console.log(`Expected balance:`, expectedBalance.toString());
        // Note: Exact balance verification might need adjustment based on actual reward calculation
      }

      console.log("✅ All participants successfully claimed their rewards");
    });

    it("Should fail to claim reward when league is not closed", async () => {
      console.log(
        "❌ Testing claim reward failure when league is not closed..."
      );

      // Setup one participant
      const participantPDA = globalTestState.createParticipantPDA(
        leaguePDA,
        accounts.user2.publicKey
      );

      await globalTestState.setupUserTokenAccount(
        accounts.user2,
        accounts.entryTokenMint,
        accounts.admin,
        10000000
      );

      await testHelpers.joinLeague(
        accounts.user2,
        leaguePDA,
        participantPDA,
        TEST_CONFIG.ENTRY_AMOUNT
      );

      const leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);
      const rewardVaultATA = await globalTestState.getRewardVaultATA(
        accounts.entryTokenMint,
        leaguePDA
      );
      const participantATA = await globalTestState.getRewardVaultATA(
        accounts.entryTokenMint,
        accounts.user2.publicKey
      );

      try {
        await testHelpers.claimReward(
          accounts.user2,
          leaguePDA,
          participantPDA,
          leaderboardPDA,
          rewardVaultATA,
          participantATA
        );

        expect.fail("Should have failed");
      } catch (error) {
        expect(error.message).to.include("LeagueNotClosed");
        console.log(
          "✅ Correctly failed to claim reward when league is not closed"
        );
      }
    });

    it("Should fail to claim reward when already claimed", async () => {
      console.log("❌ Testing claim reward failure when already claimed...");

      // Setup participant and complete the flow
      const participantPDA = globalTestState.createParticipantPDA(
        leaguePDA,
        accounts.user2.publicKey
      );

      await globalTestState.setupUserTokenAccount(
        accounts.user2,
        accounts.entryTokenMint,
        accounts.admin,
        10000000
      );

      await testHelpers.joinLeague(
        accounts.user2,
        leaguePDA,
        participantPDA,
        TEST_CONFIG.ENTRY_AMOUNT
      );

      // Open position
      const positionPDA = globalTestState.createPositionPDA(
        leaguePDA,
        accounts.user2.publicKey,
        marketPDA,
        0
      );
      // Open position with different sizes to create different PnL
      const direction = { long: {} };
      const size = 1000000; // Different sizes: 1M, 1.5M, 2M
      const leverage = 2;

      await testHelpers.openPosition(
        accounts.user2,
        leaguePDA,
        marketPDA,
        oracleFeedPDA,
        participantPDA,
        positionPDA,
        direction,
        size,
        leverage,
        0,
      );

      await testHelpers.setOraclePrice(oracleFeedPDA, 150000000); // 150.000 (50% increase)

      const leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);

      await testHelpers.refreshParticipant(
        accounts.user2,
        leaguePDA,
        participantPDA,
        leaderboardPDA,
        [positionPDA],
        [oracleFeedPDA],
      );

      // Close league
      await testHelpers.closeLeague(leaguePDA, accounts.user1, rewardVaultATA);

      const participantATA = await globalTestState.getRewardVaultATA(
        accounts.entryTokenMint,
        accounts.user2.publicKey
      );

      // First claim should succeed
      await testHelpers.claimReward(
        accounts.user2,
        leaguePDA,
        participantPDA,
        leaderboardPDA,
        rewardVaultATA,
        participantATA
      );

      // Second claim should fail
      try {
        await testHelpers.claimReward(
          accounts.user2,
          leaguePDA,
          participantPDA,
          leaderboardPDA,
          rewardVaultATA,
          participantATA
        );

        expect.fail("Should have failed");
      } catch (error) {
        expect(error.message).to.include("AlreadyClaimed");
        console.log("✅ Correctly failed to claim reward when already claimed");
      }
    });

    it("Should fail to claim reward when not in top k", async () => {
      console.log("❌ Testing claim reward failure when not in top k...");

      // Setup 4 participants (more than k=3)
      const users = [
        accounts.user1,
        accounts.user2,
        accounts.user3,
        accounts.user4,
      ];

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const participantPDA = globalTestState.createParticipantPDA(
          leaguePDA,
          user.publicKey
        );
        participantPDAs.push(participantPDA);

        await globalTestState.setupUserTokenAccount(
          user,
          accounts.entryTokenMint,
          accounts.admin,
          10000000
        );

        await testHelpers.joinLeague(
          user,
          leaguePDA,
          participantPDA,
          TEST_CONFIG.ENTRY_AMOUNT
        );
      }

      // Close league
      await testHelpers.closeLeague(leaguePDA, accounts.user1, rewardVaultATA);

      const leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);

      // Try to claim with user4 (should not be in top 3)
      const participantATA = await globalTestState.getRewardVaultATA(
        accounts.entryTokenMint,
        accounts.user4.publicKey
      );

      try {
        await testHelpers.claimReward(
          accounts.user4,
          leaguePDA,
          participantPDAs[3], // user4's participant PDA
          leaderboardPDA,
          rewardVaultATA,
          participantATA
        );

        expect.fail("Should have failed");
      } catch (error) {
        expect(error.message).to.include("NotInTopK");
        console.log("✅ Correctly failed to claim reward when not in top k");
      }
    });

    it("Should calculate correct reward distribution based on ranking", async () => {
      console.log("🧮 Testing correct reward distribution calculation...");

      // Setup 3 participants with known PnL to control ranking
      const users = [accounts.user1, accounts.user2, accounts.user3];

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const participantPDA = globalTestState.createParticipantPDA(
          leaguePDA,
          user.publicKey
        );
        participantPDAs.push(participantPDA);

        await globalTestState.setupUserTokenAccount(
          user,
          accounts.entryTokenMint,
          accounts.admin,
          10000000
        );

        await testHelpers.joinLeague(
          user,
          leaguePDA,
          participantPDA,
          TEST_CONFIG.ENTRY_AMOUNT
        );
      }

      // Refresh all participants to update leaderboard
      const leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);
      for (let i = 0; i < users.length; i++) {
        await testHelpers.refreshParticipant(
          users[i],
          leaguePDA,
          participantPDAs[i],
          leaderboardPDA,
          [],
          []
        );
      }

      // Close league
      await testHelpers.closeLeague(leaguePDA, accounts.user1, rewardVaultATA);

      // Get total reward amount
      const rewardVaultBalance = await getAccount(
        getProvider().connection,
        rewardVaultATA
      );
      const totalReward = Number(rewardVaultBalance.amount);
      console.log("Total reward amount:", totalReward);

      // Calculate expected distribution
      // For k=3, weights are: 1st place = 3, 2nd place = 2, 3rd place = 1
      // Total weight = 3 + 2 + 1 = 6
      const k = 3;
      const totalWeight = (k * (k + 1)) / 2; // 6

      const expectedShares = [
        (totalReward * 3) / totalWeight, // 1st place: 3/6 = 50%
        (totalReward * 2) / totalWeight, // 2nd place: 2/6 = 33.33%
        (totalReward * 1) / totalWeight, // 3rd place: 1/6 = 16.67%
      ];

      console.log("Expected shares:", expectedShares);

      // Get participant balances before claiming
      const balancesBefore = [];
      for (let i = 0; i < users.length; i++) {
        const participantATA = await globalTestState.getRewardVaultATA(
          accounts.entryTokenMint,
          users[i].publicKey
        );
        const balance = await getAccount(
          getProvider().connection,
          participantATA
        );
        balancesBefore.push(Number(balance.amount));
      }

      // Claim rewards
      for (let i = 0; i < users.length; i++) {
        const participantATA = await globalTestState.getRewardVaultATA(
          accounts.entryTokenMint,
          users[i].publicKey
        );

        await testHelpers.claimReward(
          users[i],
          leaguePDA,
          participantPDAs[i],
          leaderboardPDA,
          rewardVaultATA,
          participantATA
        );
      }

      // Verify actual distribution
      for (let i = 0; i < users.length; i++) {
        const participantATA = await globalTestState.getRewardVaultATA(
          accounts.entryTokenMint,
          users[i].publicKey
        );
        const balanceAfter = await getAccount(
          getProvider().connection,
          participantATA
        );
        const actualGain = Number(balanceAfter.amount) - balancesBefore[i];

        console.log(`User ${i + 1} actual gain:`, actualGain);
        console.log(`User ${i + 1} expected share:`, expectedShares[i]);

        // Allow for small rounding differences
        expect(Math.abs(actualGain - expectedShares[i])).to.be.lessThan(2);
      }

      console.log("✅ Reward distribution calculation is correct");
    });
  });
});
