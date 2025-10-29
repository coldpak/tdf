import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  globalTestState,
  getProgram,
  getOracleProgram,
  getAccounts,
  getPDAs,
  TEST_CONFIG,
} from "./0_global-setup";
import { TestHelpers } from "./helpers";

describe("Leaderboard Tests", () => {
  let testHelpers: TestHelpers;
  let accounts: any;
  let pdas: any;
  let leaguePDA: PublicKey;
  let leaderboardPDA: PublicKey;
  let marketPDA: PublicKey;
  let oracleFeedPDA: PublicKey;
  let nonce: number = 0;

  // Test configuration
  const INITIAL_PRICE = 100_000_000; // $100 with 6 decimals

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
      `✅ Initial oracle price set to: ${formatDollars(
        INITIAL_PRICE.toString()
      )}`
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

  describe("1. Leaderboard Creation", () => {
    it("Should create leaderboard when league is created", async () => {
      console.log("🏆 Testing leaderboard creation...");

      const startTs = Math.floor(Date.now() / 1000) + 3600;
      const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
      const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
      const markets = [marketPDA];
      const metadataUri = "https://example.com/league-metadata";
      const maxParticipants = 100;
      const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
      const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;
      const k = 10; // Top 10 leaderboard

      leaguePDA = globalTestState.createLeaguePDA(
        accounts.user1.publicKey,
        nonce
      );
      leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);

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

      // Verify leaderboard was created
      const leaderboard = await getProgram().account.leaderboard.fetch(
        leaderboardPDA
      );

      // log leaderboard
      console.log("Leaderboard:", {
        league: leaderboard.league.toString(),
        k: leaderboard.k,
        topkEquity: leaderboard.topkEquity,
        topkEquityScores: leaderboard.topkEquityScores,
        topkVolume: leaderboard.topkVolume,
        topkVolumeScores: leaderboard.topkVolumeScores,
      });

      expect(leaderboard.league.toString()).to.equal(leaguePDA.toString());
      expect(leaderboard.k).to.equal(k);
      expect(leaderboard.topkEquity).to.be.an("array").that.is.empty;
      expect(leaderboard.topkEquityScores).to.be.an("array").that.is.empty;
      expect(leaderboard.topkVolume).to.be.an("array").that.is.empty;
      expect(leaderboard.topkVolumeScores).to.be.an("array").that.is.empty;
      expect(leaderboard.lastUpdated.toNumber()).to.be.a("number");

      console.log(
        "✅ Leaderboard created successfully with empty TopK vectors"
      );
      nonce++;
    });
  });

  describe("2. Basic Update", () => {
    let participant1PDA: PublicKey;
    let participant2PDA: PublicKey;

    before(async () => {
      console.log("leaguePDA", leaguePDA.toString());
      await testHelpers.startLeague(leaguePDA, accounts.user1);

      // Setup participants
      participant1PDA = globalTestState.createParticipantPDA(
        leaguePDA,
        accounts.user1.publicKey
      );
      participant2PDA = globalTestState.createParticipantPDA(
        leaguePDA,
        accounts.user2.publicKey
      );

      // Setup user token accounts
      await globalTestState.setupUserTokenAccount(
        accounts.user1,
        accounts.entryTokenMint,
        accounts.admin,
        10000000
      );
      await globalTestState.setupUserTokenAccount(
        accounts.user2,
        accounts.entryTokenMint,
        accounts.admin,
        10000000
      );

      // Join league
      await testHelpers.joinLeague(
        accounts.user1,
        leaguePDA,
        participant1PDA,
        TEST_CONFIG.ENTRY_AMOUNT
      );
      await testHelpers.joinLeague(
        accounts.user2,
        leaguePDA,
        participant2PDA,
        TEST_CONFIG.ENTRY_AMOUNT
      );

      nonce++;
    });

    it("Should update leaderboard when participant refreshes", async () => {
      console.log("🔄 Testing basic leaderboard update...");

      // Set oracle price
      await testHelpers.setOraclePrice(oracleFeedPDA, 100000000); // $100

      // Create position for user1
      const position1PDA = globalTestState.createPositionPDA(
        leaguePDA,
        accounts.user1.publicKey,
        marketPDA,
        0
      );

      await testHelpers.openPosition(
        accounts.user1,
        leaguePDA,
        marketPDA,
        oracleFeedPDA,
        participant1PDA,
        position1PDA,
        { long: {} },
        1000, // 1000 tokens
        5, // 5x leverage
        0 // seq_num should be 0 for first position
      );

      console.log("leaguePDA", leaguePDA.toString());
      console.log("participant1PDA", participant1PDA.toString());
      console.log("leaderboardPDA", leaderboardPDA.toString());

      // Refresh participant to update leaderboard
      await testHelpers.refreshParticipant(
        accounts.user1,
        leaguePDA,
        participant1PDA,
        leaderboardPDA,
        [position1PDA],
        [oracleFeedPDA]
      );

      // Verify leaderboard was updated
      const leaderboard = await getProgram().account.leaderboard.fetch(
        leaderboardPDA
      );

      // log leaderboard
      console.log("Leaderboard:", {
        topkEquity: leaderboard.topkEquity,
        topkEquityScores: leaderboard.topkEquityScores,
        topkVolume: leaderboard.topkVolume,
        topkVolumeScores: leaderboard.topkVolumeScores,
        lastUpdated: leaderboard.lastUpdated,
        k: leaderboard.k,
      });

      expect(leaderboard.topkEquity).to.have.length(1);
      expect(leaderboard.topkEquity[0].toString()).to.equal(
        participant1PDA.toString()
      );
      expect(leaderboard.topkEquityScores).to.have.length(1);
      expect(leaderboard.topkEquityScores[0].toNumber()).to.be.greaterThan(0);

      expect(leaderboard.topkVolume).to.have.length(1);
      expect(leaderboard.topkVolume[0].toString()).to.equal(
        participant1PDA.toString()
      );
      expect(leaderboard.topkVolumeScores).to.have.length(1);
      expect(leaderboard.topkVolumeScores[0].toNumber()).to.be.greaterThan(0);

      console.log("✅ Leaderboard updated with participant in Top1");
    });
  });

  describe("3. Sorting Logic", () => {
    let participants: Keypair[];
    let participantPDAs: PublicKey[];

    beforeEach(async () => {
      // Create league and start it
      const startTs = Math.floor(Date.now() / 1000) - 3600;
      const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
      const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
      const markets = [marketPDA];
      const metadataUri = "https://example.com/league-metadata";
      const maxParticipants = 100;
      const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
      const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;
      const k = 5; // Top 5 leaderboard

      leaguePDA = globalTestState.createLeaguePDA(
        accounts.user1.publicKey,
        nonce
      );
      console.log("leaguePDA", leaguePDA.toString());
      leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);
      console.log("leaderboardPDA", leaderboardPDA.toString());

      await testHelpers.createLeague(
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

      await testHelpers.startLeague(leaguePDA, accounts.user1);

      // Create multiple participants
      participants = [accounts.user1, accounts.user2, accounts.user3];
      participantPDAs = participants.map((user) =>
        globalTestState.createParticipantPDA(leaguePDA, user.publicKey)
      );

      // Setup token accounts and join league
      for (let i = 0; i < participants.length; i++) {
        await globalTestState.setupUserTokenAccount(
          participants[i],
          accounts.entryTokenMint,
          accounts.admin,
          10000000
        );
        await testHelpers.joinLeague(
          participants[i],
          leaguePDA,
          participantPDAs[i],
          entryAmount
        );
      }

      nonce++;
    });

    it("Should sort participants by equity/volume correctly", async () => {
      console.log("📊 Testing sorting logic...");

      // Set oracle price
      await testHelpers.setOraclePrice(oracleFeedPDA, 100000000); // $100

      // Create positions with different sizes (different equity/volume)
      const positions = [];
      const sizes = [1000, 2000, 500]; // Different position sizes

      for (let i = 0; i < participants.length; i++) {
        const positionPDA = globalTestState.createPositionPDA(
          leaguePDA,
          participants[i].publicKey,
          marketPDA,
          0
        );
        positions.push(positionPDA);

        await testHelpers.openPosition(
          participants[i],
          leaguePDA,
          marketPDA,
          oracleFeedPDA,
          participantPDAs[i],
          positionPDA,
          { long: {} },
          sizes[i],
          5, // 5x leverage
          0 // seq_num should be 0 for first position
        );
      }

      // Set oracle price to $110
      await testHelpers.setOraclePrice(oracleFeedPDA, 110000000);

      // Refresh participants to update leaderboard
      for (let i = 0; i < participants.length; i++) {
        await testHelpers.refreshParticipant(
          participants[i],
          leaguePDA,
          participantPDAs[i],
          leaderboardPDA,
          [positions[i]],
          [oracleFeedPDA]
        );
      }

      // Verify leaderboard is sorted correctly
      const leaderboard = await getProgram().account.leaderboard.fetch(
        leaderboardPDA
      );

      expect(leaderboard.topkEquity).to.have.length(3);
      expect(leaderboard.topkEquityScores).to.have.length(3);

      // Check that scores are in descending order
      for (let i = 0; i < leaderboard.topkEquityScores.length - 1; i++) {
        expect(
          leaderboard.topkEquityScores[i].toNumber()
        ).to.be.greaterThanOrEqual(
          leaderboard.topkEquityScores[i + 1].toNumber()
        );
      }

      // Verify volume leaderboard is also sorted
      expect(leaderboard.topkVolume).to.have.length(3);
      expect(leaderboard.topkVolumeScores).to.have.length(3);

      for (let i = 0; i < leaderboard.topkVolumeScores.length - 1; i++) {
        expect(
          leaderboard.topkVolumeScores[i].toNumber()
        ).to.be.greaterThanOrEqual(
          leaderboard.topkVolumeScores[i + 1].toNumber()
        );
      }

      console.log("✅ Participants sorted correctly by equity and volume");
    });
  });

  describe("4. Update Test", () => {
    let participantPDA: PublicKey;
    let positionPDA: PublicKey;

    beforeEach(async () => {
      // Create league and start it
      const startTs = Math.floor(Date.now() / 1000) - 3600;
      const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
      const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
      const markets = [marketPDA];
      const metadataUri = "https://example.com/league-metadata";
      const maxParticipants = 100;
      const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
      const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;
      const k = 10;

      leaguePDA = globalTestState.createLeaguePDA(
        accounts.user1.publicKey,
        nonce
      );
      leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);

      await testHelpers.createLeague(
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

      await testHelpers.startLeague(leaguePDA, accounts.user1);

      participantPDA = globalTestState.createParticipantPDA(
        leaguePDA,
        accounts.user1.publicKey
      );
      positionPDA = globalTestState.createPositionPDA(
        leaguePDA,
        accounts.user1.publicKey,
        marketPDA,
        0
      );

      await globalTestState.setupUserTokenAccount(
        accounts.user1,
        accounts.entryTokenMint,
        accounts.admin,
        10000000
      );

      await testHelpers.joinLeague(
        accounts.user1,
        leaguePDA,
        participantPDA,
        entryAmount
      );

      nonce++;
    });

    it("Should update leaderboard when participant equity changes", async () => {
      console.log("🔄 Testing leaderboard update on equity change...");

      // Initial position
      await testHelpers.setOraclePrice(oracleFeedPDA, 100000000); // $100

      await testHelpers.openPosition(
        accounts.user1,
        leaguePDA,
        marketPDA,
        oracleFeedPDA,
        participantPDA,
        positionPDA,
        { long: {} },
        1000,
        5,
        0
      );

      // First refresh
      await testHelpers.refreshParticipant(
        accounts.user1,
        leaguePDA,
        participantPDA,
        leaderboardPDA,
        [positionPDA],
        [oracleFeedPDA]
      );

      const leaderboardBefore = await getProgram().account.leaderboard.fetch(
        leaderboardPDA
      );
      const initialScore = leaderboardBefore.topkEquityScores[0];

      // Change oracle price to affect equity
      await testHelpers.setOraclePrice(oracleFeedPDA, 120000000); // $120 (20% increase)

      // Second refresh
      await testHelpers.refreshParticipant(
        accounts.user1,
        leaguePDA,
        participantPDA,
        leaderboardPDA,
        [positionPDA],
        [oracleFeedPDA]
      );

      const leaderboardAfter = await getProgram().account.leaderboard.fetch(
        leaderboardPDA
      );
      const updatedScore = leaderboardAfter.topkEquityScores[0];

      // Verify score changed
      expect(updatedScore.toNumber()).to.not.equal(initialScore.toNumber());
      expect(updatedScore.toNumber()).to.be.greaterThan(
        initialScore.toNumber()
      ); // Should be higher due to price increase

      console.log(
        "✅ Leaderboard updated correctly when participant equity changed"
      );
    });
  });

  describe("5. K Limit Test", () => {
    let participants: Keypair[];
    let participantPDAs: PublicKey[];

    beforeEach(async () => {
      // Create league and start it
      const startTs = Math.floor(Date.now() / 1000) - 3600;
      const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
      const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
      const markets = [marketPDA];
      const metadataUri = "https://example.com/league-metadata";
      const maxParticipants = 100;
      const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
      const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;
      const k = 3; // Top 3 leaderboard

      leaguePDA = globalTestState.createLeaguePDA(
        accounts.user1.publicKey,
        nonce
      );
      leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);

      await testHelpers.createLeague(
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

      await testHelpers.startLeague(leaguePDA, accounts.user1);

      // Create more participants than K
      participants = [
        accounts.user1,
        accounts.user2,
        accounts.user3,
        accounts.user4,
        accounts.user5,
      ];
      participantPDAs = participants.map((user) =>
        globalTestState.createParticipantPDA(leaguePDA, user.publicKey)
      );

      // Setup token accounts and join league
      for (let i = 0; i < participants.length; i++) {
        await globalTestState.setupUserTokenAccount(
          participants[i],
          accounts.entryTokenMint,
          accounts.admin,
          10000000
        );
        await testHelpers.joinLeague(
          participants[i],
          leaguePDA,
          participantPDAs[i],
          entryAmount
        );
      }

      nonce++;
    });

    it("Should maintain only top K participants in leaderboard", async () => {
      console.log("🔢 Testing K limit functionality...");

      await testHelpers.setOraclePrice(oracleFeedPDA, 100000000); // $100

      // Create positions with different sizes
      const positions = [];
      const sizes = [5000, 4000, 3000, 2000, 1000]; // Decreasing sizes

      for (let i = 0; i < participants.length; i++) {
        const positionPDA = globalTestState.createPositionPDA(
          leaguePDA,
          participants[i].publicKey,
          marketPDA,
          0
        );
        positions.push(positionPDA);

        await testHelpers.openPosition(
          participants[i],
          leaguePDA,
          marketPDA,
          oracleFeedPDA,
          participantPDAs[i],
          positionPDA,
          { long: {} },
          sizes[i],
          5,
          0
        );

        // Refresh participant
        await testHelpers.refreshParticipant(
          participants[i],
          leaguePDA,
          participantPDAs[i],
          leaderboardPDA,
          [positionPDA],
          [oracleFeedPDA]
        );
      }

      // Verify only top K participants are in leaderboard
      const leaderboard = await getProgram().account.leaderboard.fetch(
        leaderboardPDA
      );

      expect(leaderboard.topkEquity).to.have.length(leaderboard.k);
      expect(leaderboard.topkEquityScores).to.have.length(leaderboard.k);
      expect(leaderboard.topkVolume).to.have.length(leaderboard.k);
      expect(leaderboard.topkVolumeScores).to.have.length(leaderboard.k);

      // Verify scores are in descending order
      for (let i = 0; i < leaderboard.k - 1; i++) {
        expect(
          leaderboard.topkEquityScores[i].toNumber()
        ).to.be.greaterThanOrEqual(
          leaderboard.topkEquityScores[i + 1].toNumber()
        );
      }

      console.log("✅ Only top K participants maintained in leaderboard");
    });
  });

  describe("6. Volume & Equity Separation", () => {
    let participantPDA: PublicKey;
    let positionPDA: PublicKey;

    beforeEach(async () => {
      // Create league and start it
      const startTs = Math.floor(Date.now() / 1000) - 3600;
      const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
      const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
      const markets = [marketPDA];
      const metadataUri = "https://example.com/league-metadata";
      const maxParticipants = 100;
      const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
      const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;
      const k = 10;

      leaguePDA = globalTestState.createLeaguePDA(
        accounts.user1.publicKey,
        nonce
      );
      leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);

      await testHelpers.createLeague(
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

      await testHelpers.startLeague(leaguePDA, accounts.user1);

      participantPDA = globalTestState.createParticipantPDA(
        leaguePDA,
        accounts.user1.publicKey
      );
      positionPDA = globalTestState.createPositionPDA(
        leaguePDA,
        accounts.user1.publicKey,
        marketPDA,
        0
      );

      await globalTestState.setupUserTokenAccount(
        accounts.user1,
        accounts.entryTokenMint,
        accounts.admin,
        10000000
      );

      await testHelpers.joinLeague(
        accounts.user1,
        leaguePDA,
        participantPDA,
        entryAmount
      );

      nonce++;
    });

    it("Should track volume and equity independently", async () => {
      console.log("📈 Testing volume and equity independent tracking...");

      await testHelpers.setOraclePrice(oracleFeedPDA, 100000000); // $100

      // Create position
      await testHelpers.openPosition(
        accounts.user1,
        leaguePDA,
        marketPDA,
        oracleFeedPDA,
        participantPDA,
        positionPDA,
        { long: {} },
        1000,
        5,
        0
      );

      // Refresh participant
      await testHelpers.refreshParticipant(
        accounts.user1,
        leaguePDA,
        participantPDA,
        leaderboardPDA,
        [positionPDA],
        [oracleFeedPDA]
      );

      const leaderboard = await getProgram().account.leaderboard.fetch(
        leaderboardPDA
      );

      // Both equity and volume should have the same participant
      expect(leaderboard.topkEquity).to.have.length(1);
      expect(leaderboard.topkVolume).to.have.length(1);
      expect(leaderboard.topkEquity[0].toString()).to.equal(
        participantPDA.toString()
      );
      expect(leaderboard.topkVolume[0].toString()).to.equal(
        participantPDA.toString()
      );

      // But scores might be different
      expect(leaderboard.topkEquityScores[0].toNumber()).to.be.greaterThan(0);
      expect(leaderboard.topkVolumeScores[0].toNumber()).to.be.greaterThan(0);

      console.log("✅ Volume and equity tracked independently");
    });
  });

  describe("7. Timestamp Update", () => {
    let participantPDA: PublicKey;
    let positionPDA: PublicKey;

    beforeEach(async () => {
      // Create league and start it
      const startTs = Math.floor(Date.now() / 1000) - 3600;
      const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
      const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
      const markets = [marketPDA];
      const metadataUri = "https://example.com/league-metadata";
      const maxParticipants = 100;
      const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
      const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;
      const k = 10;

      leaguePDA = globalTestState.createLeaguePDA(
        accounts.user1.publicKey,
        nonce
      );
      leaderboardPDA = globalTestState.createLeaderboardPDA(leaguePDA);

      await testHelpers.createLeague(
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

      await testHelpers.startLeague(leaguePDA, accounts.user1);

      participantPDA = globalTestState.createParticipantPDA(
        leaguePDA,
        accounts.user1.publicKey
      );
      positionPDA = globalTestState.createPositionPDA(
        leaguePDA,
        accounts.user1.publicKey,
        marketPDA,
        0
      );

      await globalTestState.setupUserTokenAccount(
        accounts.user1,
        accounts.entryTokenMint,
        accounts.admin,
        10000000
      );

      await testHelpers.joinLeague(
        accounts.user1,
        leaguePDA,
        participantPDA,
        entryAmount
      );

      nonce++;
    });

    it("Should update timestamp on leaderboard refresh", async () => {
      console.log("⏰ Testing timestamp update...");

      await testHelpers.setOraclePrice(oracleFeedPDA, 100000000); // $100

      // Create position
      await testHelpers.openPosition(
        accounts.user1,
        leaguePDA,
        marketPDA,
        oracleFeedPDA,
        participantPDA,
        positionPDA,
        { long: {} },
        1000,
        5,
        0
      );

      // Get initial timestamp
      const leaderboardBefore = await getProgram().account.leaderboard.fetch(
        leaderboardPDA
      );
      const initialTimestamp = leaderboardBefore.lastUpdated;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Refresh participant
      await testHelpers.refreshParticipant(
        accounts.user1,
        leaguePDA,
        participantPDA,
        leaderboardPDA,
        [positionPDA],
        [oracleFeedPDA]
      );

      // Get updated timestamp
      const leaderboardAfter = await getProgram().account.leaderboard.fetch(
        leaderboardPDA
      );
      const updatedTimestamp = leaderboardAfter.lastUpdated;

      // Verify timestamp was updated
      expect(updatedTimestamp.toNumber()).to.be.greaterThan(
        initialTimestamp.toNumber()
      );

      console.log("✅ Timestamp updated correctly on leaderboard refresh");
    });
  });

  function formatDollars(num: string) {
    return (Number(num) / 1000000).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
});
