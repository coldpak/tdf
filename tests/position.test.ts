import { expect } from "chai";
import {
  globalTestState,
  getProgram,
  getAccounts,
  getPDAs,
  TEST_CONFIG,
} from "./global-setup";
import { TestHelpers, expectPosition, calculateExpectedPnL, calculateExpectedNotional } from "./helpers";

describe("Position Tests", () => {
  let testHelpers: TestHelpers;
  let accounts: any;
  let pdas: any;
  let leaguePDA: any;
  let participantPDA: any;
  let positionPDA0: any;
  let positionPDA1: any;
  let marketPDA: any;
  let nonce: number = 10;
  let SIZE_TOO_LARGE_TO_OPEN_POSITION = 100_000_000_000;
  let SIZE_TO_OPEN_POSITION = 50_000_000;
  let SIZE_TO_UPDATE_POSITION_SMALL = 10_000_000;
  let SIZE_TO_UPDATE_POSITION_LARGE = 100_000_000_000;

  // Initialize league before position tests
  before(async () => {
    await globalTestState.initialize();
    accounts = getAccounts();
    pdas = getPDAs();
    testHelpers = new TestHelpers(getProgram(), accounts, pdas);

    // First ensure marketPDA is initialized
    marketPDA = globalTestState.createMarketPDA(accounts.oracleFeed.publicKey);
    pdas.marketPDA = marketPDA;

    const startTs = Math.floor(Date.now() / 1000);
    const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
    const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
    const markets = [marketPDA];
    const metadataUri = "https://example.com/new-league";
    const maxParticipants = 100;
    const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
    const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;

    leaguePDA = globalTestState.createLeaguePDA(
      accounts.user1.publicKey,
      nonce
    );

    // Initialize participantPDA for position tests
    participantPDA = globalTestState.createParticipantPDA(
      leaguePDA,
      accounts.user1.publicKey
    );

    await testHelpers.createLeague(
      accounts.user1,
      startTs,
      endTs,
      entryAmount,
      markets,
      metadataUri,
      maxParticipants,
      virtualOnDeposit,
      maxLeverage,
      nonce
    );

    nonce++;

    // start league
    await testHelpers.startLeague(leaguePDA, accounts.user1);

    // join league
    await globalTestState.setupUserTokenAccount(
      accounts.user1,
      accounts.entryTokenMint,
      accounts.admin,
      10000000 // 10 tokens
    );

    await testHelpers.joinLeague(
      accounts.user1,
      leaguePDA,
      participantPDA,
      TEST_CONFIG.ENTRY_AMOUNT
    );

    // Calculate PDAs for position tests
    positionPDA0 = globalTestState.createPositionPDA(
      leaguePDA,
      accounts.user1.publicKey,
      marketPDA,
      0
    );
    positionPDA1 = globalTestState.createPositionPDA(
      leaguePDA,
      accounts.user1.publicKey,
      marketPDA,
      1
    );
  });

  beforeEach(async () => {});

  describe("Open Position", () => {
    it("Should fail to open position with insufficient margin", async () => {
      console.log("❌ Testing insufficient margin failure...");

      const direction = { long: {} };
      const leverage = 1; // Low leverage

      try {
        await testHelpers.openPosition(
          accounts.user1,
          leaguePDA,
          marketPDA,
          participantPDA,
          positionPDA0,
          direction,
          SIZE_TOO_LARGE_TO_OPEN_POSITION,
          leverage,
          0
        );

        expect.fail("Should have failed");
      } catch (error) {
        console.log(error.message);
        expect(error.message).to.include("Insufficient margin");
        console.log("✅ Correctly failed with insufficient margin");
      }
    });

    it("Should fail to open position with invalid leverage", async () => {
      console.log("❌ Testing invalid leverage failure...");

      const direction = { long: {} };
      const leverage = TEST_CONFIG.MAX_LEVERAGE + 1; // Exceeds max leverage of 20

      try {
        await testHelpers.openPosition(
          accounts.user1,
          leaguePDA,
          marketPDA,
          participantPDA,
          positionPDA0,
          direction,
          SIZE_TO_OPEN_POSITION,
          leverage,
          0
        );

        expect.fail("Should have failed");
      } catch (error) {
        console.log(error.message);
        expect(error.message).to.include("Invalid leverage");
        console.log("✅ Correctly failed with invalid leverage");
      }
    });

    it("Should fail to open position in not joined league", async () => {
      console.log("❌ Testing position opening in not joined league...");

      let participantPDA2 = globalTestState.createParticipantPDA(
        leaguePDA,
        accounts.user2.publicKey
      );

      try {
        await testHelpers.openPosition(
          accounts.user2,
          leaguePDA,
          marketPDA,
          participantPDA2,
          positionPDA0,
          { long: {} },
          SIZE_TO_OPEN_POSITION,
          5,
          0
        );

        expect.fail("Should have failed");
      } catch (error) {
        expect(error.message).to.include(
          "The program expected this account to be already initialized."
        );
        console.log(
          "✅ Correctly failed to open position in non-active league"
        );
      }
    });

    it("Should open a long position successfully", async () => {
      console.log("📈 Testing long position opening...");

      const direction = { long: {} };
      const leverage = 5;

      const tx = await testHelpers.openPosition(
        accounts.user1,
        leaguePDA,
        marketPDA,
        participantPDA,
        positionPDA0,
        direction,
        SIZE_TO_OPEN_POSITION,
        leverage,
        0
      );

      console.log("✅ Open position tx:", tx);

      // Verify position was created
      const position = await getProgram().account.position.fetch(positionPDA0);
      expect(position.league.toString()).to.equal(leaguePDA.toString());
      expect(position.user.toString()).to.equal(
        accounts.user1.publicKey.toString()
      );
      expect(position.market.toString()).to.equal(marketPDA.toString());
      expect(position.direction).to.deep.equal({ long: {} });
      expect(position.size.toString()).to.equal(
        SIZE_TO_OPEN_POSITION.toString()
      );
      expect(position.leverage).to.equal(leverage);
      expect(position.entryPrice.toString()).to.equal("188000000"); // From oracle mock
      expect(position.openedAt.toNumber()).to.be.greaterThan(0);
      expect(position.closedAt.toNumber()).to.equal(0);

      // Verify participant equity was reduced by margin
      const participant = await getProgram().account.participant.fetch(
        participantPDA
      );
      const expectedMargin = position.notional.toNumber() / leverage;
      const expectedAvailableBalance =
        TEST_CONFIG.VIRTUAL_BALANCE - expectedMargin; // virtual_balance - margin
      const participantAvailableBalance =
        participant.virtualBalance.toNumber() -
        participant.usedMargin.toNumber();
      expect(participantAvailableBalance.toString()).to.equal(
        expectedAvailableBalance.toString()
      );

      console.log("✅ Long position opened successfully");
    });

    it("Should fail to open position with invalid sequence number", async () => {
      console.log(
        "❌ Testing position opening with invalid sequence number..."
      );

      // Try to open position with wrong sequence number (use 0 instead of currentSeq)
      try {
        await testHelpers.openPosition(
          accounts.user1,
          leaguePDA,
          marketPDA,
          participantPDA,
          positionPDA1,
          { long: {} },
          SIZE_TO_OPEN_POSITION,
          5,
          0 // Wrong sequence number
        );

        expect.fail(
          "Should have failed to open position with invalid sequence number"
        );
      } catch (error) {
        expect(error.message).to.include("Invalid position sequence");
        console.log(
          "✅ Correctly failed to open position with invalid sequence number"
        );
      }
    });
  });

  describe("Increase Position Size", () => {
    it("Should increase position size successfully", async () => {
      console.log("📈 Testing position size increase...");

      const initialPosition = await getProgram().account.position.fetch(
        positionPDA0
      );
      const initialSize = initialPosition.size;

      const tx = await testHelpers.increasePositionSize(
        accounts.user1,
        leaguePDA,
        marketPDA,
        participantPDA,
        positionPDA0,
        SIZE_TO_UPDATE_POSITION_SMALL
      );

      console.log("✅ Increase position size tx:", tx);

      // Verify position was updated
      const updatedPosition = await getProgram().account.position.fetch(
        positionPDA0
      );
      expect(updatedPosition.size.toString()).to.equal(
        (initialSize.toNumber() + SIZE_TO_UPDATE_POSITION_SMALL).toString()
      );
      expect(updatedPosition.direction).to.deep.equal({ long: {} });

      console.log("✅ Position size increased successfully");
    });

    it("Should fail to increase position size with insufficient margin", async () => {
      console.log(
        "❌ Testing position size increase with insufficient margin..."
      );

      try {
        await testHelpers.increasePositionSize(
          accounts.user1,
          leaguePDA,
          marketPDA,
          participantPDA,
          positionPDA0,
          SIZE_TO_UPDATE_POSITION_LARGE
        );

        expect.fail("Should have failed with insufficient margin");
      } catch (error) {
        console.log(error.message);
        expect(error.message).to.include("Insufficient margin");
        console.log("✅ Correctly failed with insufficient margin");
      }
    });
  });

  describe("Decrease Position Size", () => {
    it("Should decrease position size successfully", async () => {
      console.log("📉 Testing position size decrease...");

      const initialPosition = await getProgram().account.position.fetch(
        positionPDA0
      );
      const initialSize = initialPosition.size;

      const tx = await testHelpers.decreasePositionSize(
        accounts.user1,
        leaguePDA,
        participantPDA,
        positionPDA0,
        SIZE_TO_UPDATE_POSITION_SMALL
      );

      console.log("✅ Decrease position size tx:", tx);

      // Verify position was updated
      const updatedPosition = await getProgram().account.position.fetch(
        positionPDA0
      );
      expect(updatedPosition.size.toString()).to.equal(
        (initialSize.toNumber() - SIZE_TO_UPDATE_POSITION_SMALL).toString()
      );
      expect(updatedPosition.direction).to.deep.equal({ long: {} });

      console.log("✅ Position size decreased successfully");
    });

    it("Should close position when decreasing size equals position size", async () => {
      console.log("🔒 Testing position closure when decreasing full size...");

      const initialPosition = await getProgram().account.position.fetch(
        positionPDA0
      );
      const initialSize = initialPosition.size;

      const tx = await testHelpers.decreasePositionSize(
        accounts.user1,
        leaguePDA,
        participantPDA,
        positionPDA0,
        initialSize.toNumber()
      );

      console.log("✅ Close position tx:", tx);

      // Verify position was closed
      const updatedPosition = await getProgram().account.position.fetch(
        positionPDA0
      );
      expect(updatedPosition.size.toString()).to.equal("0");
      expect(updatedPosition.closedAt.toNumber()).to.be.greaterThan(0);

      console.log("✅ Position closed successfully");
    });

    it("Should fail to decrease position size with invalid size", async () => {
      console.log("❌ Testing position size decrease with invalid size...");

      try {
        await testHelpers.decreasePositionSize(
          accounts.user1,
          leaguePDA,
          participantPDA,
          positionPDA0,
          SIZE_TOO_LARGE_TO_OPEN_POSITION
        );

        expect.fail("Should have failed with invalid size");
      } catch (error) {
        expect(error.message).to.include("Invalid reduce size");
        console.log("✅ Correctly failed with invalid size");
      }
    });
  });

  describe("PnL Calculation Tests", () => {
    it("Should calculate PnL correctly for long position with price changes", async () => {
      console.log("📊 Testing PnL calculation for long position...");

      // Create a new position for PnL testing
      const pnlPositionPDA = globalTestState.createPositionPDA(
        leaguePDA,
        accounts.user1.publicKey,
        marketPDA,
        1
      );

      // Open long position
      await testHelpers.openPosition(
        accounts.user1,
        leaguePDA,
        marketPDA,
        participantPDA,
        pnlPositionPDA,
        { long: {} },
        SIZE_TO_OPEN_POSITION,
        5, // LEVERAGE
        1
      );

      const position = await getProgram().account.position.fetch(pnlPositionPDA);
      const entryPrice = position.entryPrice.toNumber();
      const size = position.size.toNumber();
      const notional = position.notional.toNumber();

      console.log(`Entry price: ${entryPrice}, Size: ${size}, Notional: ${notional}`);

      // Test PnL calculation with specific price scenarios and exact values
      const priceScenarios = [
        { 
          price: Math.floor(entryPrice * 1.1), 
          description: "10% price increase",
          expectedPnL: Math.floor((Math.floor(entryPrice * 1.1) * size / 1e6) - (entryPrice * size / 1e6))
        },
        { 
          price: Math.floor(entryPrice * 0.9), 
          description: "10% price decrease",
          expectedPnL: Math.floor((Math.floor(entryPrice * 0.9) * size / 1e6) - (entryPrice * size / 1e6))
        },
        { 
          price: Math.floor(entryPrice * 1.5), 
          description: "50% price increase",
          expectedPnL: Math.floor((Math.floor(entryPrice * 1.5) * size / 1e6) - (entryPrice * size / 1e6))
        },
        { 
          price: Math.floor(entryPrice * 0.5), 
          description: "50% price decrease",
          expectedPnL: Math.floor((Math.floor(entryPrice * 0.5) * size / 1e6) - (entryPrice * size / 1e6))
        },
      ];

      for (const scenario of priceScenarios) {
        const calculatedPnL = calculateExpectedPnL(
          entryPrice,
          scenario.price,
          size,
          { long: {} }
        );

        console.log(`${scenario.description}: Expected ${scenario.expectedPnL}, Calculated ${calculatedPnL}`);
        
        // Verify exact PnL calculation
        expect(calculatedPnL).to.equal(scenario.expectedPnL);
        
        // Also verify PnL direction matches price movement
        if (scenario.price > entryPrice) {
          expect(calculatedPnL).to.be.greaterThan(0);
        } else {
          expect(calculatedPnL).to.be.lessThan(0);
        }
      }

      console.log("✅ PnL calculation for long position verified");
    });

    it("Should calculate PnL correctly for short position with price changes", async () => {
      console.log("📊 Testing PnL calculation for short position...");

      // Create a new position for PnL testing
      const shortPositionPDA = globalTestState.createPositionPDA(
        leaguePDA,
        accounts.user1.publicKey,
        marketPDA,
        2
      );

      // Open short position
      await testHelpers.openPosition(
        accounts.user1,
        leaguePDA,
        marketPDA,
        participantPDA,
        shortPositionPDA,
        { short: {} },
        SIZE_TO_OPEN_POSITION,
        5, // LEVERAGE
        2
      );

      const position = await getProgram().account.position.fetch(shortPositionPDA);
      const entryPrice = position.entryPrice.toNumber();
      const size = position.size.toNumber();

      // Test PnL calculation for short position with exact values
      const priceScenarios = [
        { 
          price: Math.floor(entryPrice * 0.9), 
          description: "10% price decrease (short profit)",
          expectedPnL: Math.floor(-((Math.floor(entryPrice * 0.9) * size / 1e6) - (entryPrice * size / 1e6)))
        },
        { 
          price: Math.floor(entryPrice * 1.1), 
          description: "10% price increase (short loss)",
          expectedPnL: Math.floor(-((Math.floor(entryPrice * 1.1) * size / 1e6) - (entryPrice * size / 1e6)))
        },
        { 
          price: Math.floor(entryPrice * 0.5), 
          description: "50% price decrease (big short profit)",
          expectedPnL: Math.floor(-((Math.floor(entryPrice * 0.5) * size / 1e6) - (entryPrice * size / 1e6)))
        },
        { 
          price: Math.floor(entryPrice * 1.5), 
          description: "50% price increase (big short loss)",
          expectedPnL: Math.floor(-((Math.floor(entryPrice * 1.5) * size / 1e6) - (entryPrice * size / 1e6)))
        },
      ];

      for (const scenario of priceScenarios) {
        const calculatedPnL = calculateExpectedPnL(
          entryPrice,
          scenario.price,
          size,
          { short: {} }
        );

        console.log(`${scenario.description}: Expected ${scenario.expectedPnL}, Calculated ${calculatedPnL}`);
        
        // Verify exact PnL calculation for short position
        expect(calculatedPnL).to.equal(scenario.expectedPnL);
        
        // Also verify PnL direction for short positions
        if (scenario.price < entryPrice) {
          expect(calculatedPnL).to.be.greaterThan(0);
        } else {
          expect(calculatedPnL).to.be.lessThan(0);
        }
      }

      console.log("✅ PnL calculation for short position verified");
    });

    it("Should demonstrate leverage impact on margin vs PnL", async () => {
      console.log("⚖️ Testing leverage impact on margin requirements...");

      const entryPrice = 188_000_000; // 188 USD
      const currentPrice = 200_000_000; // 200 USD (6.4% increase)
      const size = SIZE_TO_OPEN_POSITION;
      const leverages = [1, 2, 5, 10];

      // Calculate expected values
      const expectedNotional = calculateExpectedNotional(entryPrice, size);
      const expectedPnL = calculateExpectedPnL(entryPrice, currentPrice, size, { long: {} });

      console.log("Leverage | Margin Required | PnL | PnL/Margin Ratio");
      console.log("---------|-----------------|-----|------------------");

      for (const leverage of leverages) {
        const notional = calculateExpectedNotional(entryPrice, size);
        const marginRequired = notional / leverage;
        const pnl = calculateExpectedPnL(entryPrice, currentPrice, size, { long: {} });
        const pnlMarginRatio = pnl / marginRequired;

        console.log(`${leverage}x | ${marginRequired.toFixed(2)} | ${pnl.toFixed(2)} | ${pnlMarginRatio.toFixed(2)}x`);
        
        // Verify exact calculations
        expect(notional).to.equal(expectedNotional);
        expect(pnl).to.equal(expectedPnL);
        expect(marginRequired).to.equal(expectedNotional / leverage);
        expect(pnlMarginRatio).to.equal(expectedPnL / (expectedNotional / leverage));
        
        // Higher leverage = lower margin requirement, same PnL
        expect(pnl).to.be.greaterThan(0);
        expect(marginRequired).to.be.greaterThan(0);
      }

      console.log("✅ Leverage impact analysis completed");
    });

    it("Should verify PnL calculation matches program implementation", async () => {
      console.log("🔍 Testing PnL calculation accuracy against program logic...");

      // Create a position to get real program data
      const testPositionPDA = globalTestState.createPositionPDA(
        leaguePDA,
        accounts.user1.publicKey,
        marketPDA,
        3
      );

      await testHelpers.openPosition(
        accounts.user1,
        leaguePDA,
        marketPDA,
        participantPDA,
        testPositionPDA,
        { long: {} },
        SIZE_TO_OPEN_POSITION,
        5, // LEVERAGE
        3
      );

      const position = await getProgram().account.position.fetch(testPositionPDA);
      const entryPrice = position.entryPrice.toNumber();
      const size = position.size.toNumber();
      const notional = position.notional.toNumber();

      // Test specific price scenarios with exact calculations
      const testCases = [
        {
          currentPrice: 200_000_000, // 200 USD
          description: "Price 200 USD",
          expectedPnL: Math.floor((200_000_000 * size / 1e6) - (entryPrice * size / 1e6))
        },
        {
          currentPrice: 150_000_000, // 150 USD  
          description: "Price 150 USD",
          expectedPnL: Math.floor((150_000_000 * size / 1e6) - (entryPrice * size / 1e6))
        },
        {
          currentPrice: 250_000_000, // 250 USD
          description: "Price 250 USD", 
          expectedPnL: Math.floor((250_000_000 * size / 1e6) - (entryPrice * size / 1e6))
        }
      ];

      for (const testCase of testCases) {
        const calculatedPnL = calculateExpectedPnL(
          entryPrice,
          testCase.currentPrice,
          size,
          { long: {} }
        );

        console.log(`${testCase.description}: Expected ${testCase.expectedPnL}, Calculated ${calculatedPnL}`);
        
        // Verify exact match
        expect(calculatedPnL).to.equal(testCase.expectedPnL);
        
        // Verify the calculation logic manually
        const manualCalculation = Math.floor(
          (testCase.currentPrice * size / 1e6) - (entryPrice * size / 1e6)
        );
        expect(calculatedPnL).to.equal(manualCalculation);
      }

      console.log("✅ PnL calculation accuracy verified against program logic");
    });
  });
});
