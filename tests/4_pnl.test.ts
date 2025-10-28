import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import { Tdf } from "../target/types/tdf";
import { Oracle } from "../target/types/oracle";
import {
  globalTestState,
  getProgram,
  getOracleProgram,
  getAccounts,
  getPDAs,
  TEST_CONFIG,
} from "./0_global-setup";
import { TestHelpers, calculateExpectedPnL } from "./helpers";

describe("PnL Tests with Oracle Price Changes", () => {
  let testHelpers: TestHelpers;
  let accounts: any;
  let pdas: any;
  let leaguePDA: any;
  let participantPDA: any;
  let positionPDA: any;
  let nonce: number = 20;

  // Test configuration
  const INITIAL_PRICE = 100_000_000; // $100 with 6 decimals
  const POSITION_SIZE = 1_000_000; // 1 token with 6 decimals
  const LEVERAGE = 5;
  const MARKET_DECIMALS = 6;

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

    console.log("pdas.priceFeedPDA", pdas.priceFeedPDA.toString());
    // Set initial oracle price
    await testHelpers.setOraclePrice(pdas.priceFeedPDA, INITIAL_PRICE);
    console.log(`✅ Initial oracle price set to: ${INITIAL_PRICE}`);

    // First list the market
    const symbol = "BTC/USDC";
    const decimals = MARKET_DECIMALS;

    await testHelpers.listMarket(
      symbol,
      decimals,
      TEST_CONFIG.MAX_LEVERAGE,
      pdas.priceFeedPDA,
      accounts.baseCurrency.publicKey,
      accounts.admin
    );
    // Now create marketPDA with the Oracle price feed
    const marketPDA = globalTestState.createMarketPDA(pdas.priceFeedPDA);
    pdas.marketPDA = marketPDA;

    const startTs = Math.floor(Date.now() / 1000);
    const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
    const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
    const markets = [marketPDA];
    const metadataUri = "https://example.com/metadata";
    const maxParticipants = 100;
    const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
    const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;

    leaguePDA = globalTestState.createLeaguePDA(
      accounts.user1.publicKey,
      nonce
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

    // start league
    await testHelpers.startLeague(leaguePDA, accounts.user1);

    // join league
    await globalTestState.setupUserTokenAccount(
      accounts.user1,
      accounts.entryTokenMint,
      accounts.admin,
      10000000 // 10 tokens
    );

    participantPDA = globalTestState.createParticipantPDA(
      leaguePDA,
      accounts.user1.publicKey
    );

    await testHelpers.joinLeague(
      accounts.user1,
      leaguePDA,
      participantPDA,
      TEST_CONFIG.ENTRY_AMOUNT
    );

    console.log("✅ Test setup completed");
  });

  describe("PnL Calculation with Price Changes", () => {
    it("Should calculate correct PnL for long position with price increase", async () => {
      // Open long position
      positionPDA = globalTestState.createPositionPDA(
        leaguePDA,
        accounts.user1.publicKey,
        pdas.marketPDA,
        0
      );

      await testHelpers.openPosition(
        accounts.user1,
        leaguePDA,
        pdas.marketPDA,
        pdas.priceFeedPDA,
        participantPDA,
        positionPDA,
        { long: {} },
        POSITION_SIZE,
        LEVERAGE,
        0
      );

      // Get initial participant state
      const initialParticipant = await getProgram().account.participant.fetch(
        participantPDA
      );
      console.log("Initial participant state:", {
        unrealizedPnl: initialParticipant.unrealizedPnl.toString(),
        usedMargin: initialParticipant.usedMargin.toString(),
        virtualBalance: initialParticipant.virtualBalance.toString(),
        equity: (
          initialParticipant.virtualBalance.toNumber() +
          initialParticipant.unrealizedPnl.toNumber()
        ).toString(),
      });

      // Increase price by 10%
      const newPrice = Math.floor(INITIAL_PRICE * 1.1); // $110
      await testHelpers.setOraclePrice(pdas.priceFeedPDA, newPrice);
      console.log(`✅ Price increased to: ${newPrice}`);

      // Refresh participant to update PnL
      await refreshParticipantWithPositions();

      // Verify PnL calculation
      const updatedParticipant = await getProgram().account.participant.fetch(
        participantPDA
      );
      const expectedPnL = calculateExpectedPnL(
        INITIAL_PRICE,
        newPrice,
        POSITION_SIZE,
        { long: {} },
        MARKET_DECIMALS
      );

      expect(updatedParticipant.unrealizedPnl.toString()).to.equal(
        expectedPnL.toString()
      );
    });

    it("Should calculate correct PnL for long position with price decrease", async () => {
      // Decrease price by 15%
      const newPrice = Math.floor(INITIAL_PRICE * 0.85); // $85
      await testHelpers.setOraclePrice(pdas.priceFeedPDA, newPrice);
      console.log(`✅ Price decreased to: ${newPrice}`);

      // Refresh participant
      await refreshParticipantWithPositions();

      // Verify PnL calculation
      const updatedParticipant = await getProgram().account.participant.fetch(
        participantPDA
      );
      const expectedPnL = calculateExpectedPnL(
        INITIAL_PRICE,
        newPrice,
        POSITION_SIZE,
        { long: {} },
        MARKET_DECIMALS
      );

      console.log("PnL Verification (Price Decrease):", {
        expectedPnL,
        actualPnL: updatedParticipant.unrealizedPnl.toString(),
        priceChange: `${(
          ((newPrice - INITIAL_PRICE) / INITIAL_PRICE) *
          100
        ).toFixed(2)}%`,
      });

      expect(updatedParticipant.unrealizedPnl.toString()).to.equal(
        expectedPnL.toString()
      );
    });

    it("Should calculate correct PnL for short position with price changes", async () => {
      // Set price back to initial
      await testHelpers.setOraclePrice(pdas.priceFeedPDA, INITIAL_PRICE);

      // Close long position first
      await testHelpers.decreasePositionSize(
        accounts.user1,
        leaguePDA,
        pdas.priceFeedPDA,
        participantPDA,
        positionPDA,
        POSITION_SIZE
      );

      // Open short position
      positionPDA = globalTestState.createPositionPDA(
        leaguePDA,
        accounts.user1.publicKey,
        pdas.marketPDA,
        1
      );

      await testHelpers.openPosition(
        accounts.user1,
        leaguePDA,
        pdas.marketPDA,
        pdas.priceFeedPDA,
        participantPDA,
        positionPDA,
        { short: {} },
        POSITION_SIZE,
        LEVERAGE,
        1
      );

      // Increase price (bad for short position)
      const newPrice = Math.floor(INITIAL_PRICE * 1.2); // $120
      await testHelpers.setOraclePrice(pdas.priceFeedPDA, newPrice);
      console.log(`✅ Price increased to: ${newPrice} (bad for short)`);

      await refreshParticipantWithPositions();

      // Verify PnL calculation for short position
      const updatedParticipant = await getProgram().account.participant.fetch(
        participantPDA
      );
      const expectedPnL = calculateExpectedPnL(
        INITIAL_PRICE,
        newPrice,
        POSITION_SIZE,
        { short: {} },
        MARKET_DECIMALS
      );

      console.log("Short Position PnL Verification:", {
        expectedPnL,
        actualPnL: updatedParticipant.unrealizedPnl.toString(),
        priceChange: `${(
          ((newPrice - INITIAL_PRICE) / INITIAL_PRICE) *
          100
        ).toFixed(2)}%`,
      });

      expect(updatedParticipant.unrealizedPnl.toString()).to.equal(
        expectedPnL.toString()
      );
    });

    it("Should handle volatile price movements correctly", async () => {
      const priceMovements = [
        { price: Math.floor(INITIAL_PRICE * 0.8), description: "20% down" },
        { price: Math.floor(INITIAL_PRICE * 1.3), description: "30% up" },
        { price: Math.floor(INITIAL_PRICE * 0.9), description: "10% down" },
        { price: Math.floor(INITIAL_PRICE * 1.1), description: "10% up" },
        { price: INITIAL_PRICE, description: "back to initial" },
      ];

      for (const movement of priceMovements) {
        await testHelpers.setOraclePrice(pdas.priceFeedPDA, movement.price);
        console.log(`✅ Price ${movement.description}: ${movement.price}`);

        await refreshParticipantWithPositions();

        const participant = await getProgram().account.participant.fetch(
          participantPDA
        );
        const expectedPnL = calculateExpectedPnL(
          INITIAL_PRICE,
          movement.price,
          POSITION_SIZE,
          { short: {} },
          MARKET_DECIMALS
        );

        console.log(`PnL at ${movement.description}:`, {
          expectedPnL,
          actualPnL: participant.unrealizedPnl.toString(),
          equity: (
            participant.virtualBalance.toNumber() +
            participant.unrealizedPnl.toNumber()
          ).toString(),
        });

        expect(participant.unrealizedPnl.toString()).to.equal(
          expectedPnL.toString()
        );
      }
    });

    it("Should handle multiple positions with different price impacts", async () => {
      // Open a second position (long this time)
      const positionPDA2 = globalTestState.createPositionPDA(
        leaguePDA,
        accounts.user1.publicKey,
        pdas.marketPDA,
        2
      );

      await testHelpers.openPosition(
        accounts.user1,
        leaguePDA,
        pdas.marketPDA,
        pdas.priceFeedPDA,
        participantPDA,
        positionPDA2,
        { long: {} },
        POSITION_SIZE,
        LEVERAGE,
        2
      );

      // Set a new price
      const newPrice = Math.floor(INITIAL_PRICE * 1.15); // $115
      await testHelpers.setOraclePrice(pdas.priceFeedPDA, newPrice);
      console.log(`✅ Price set to: ${newPrice} for multiple positions`);

      await refreshParticipantWithPositions();

      // Calculate expected combined PnL
      const shortPnL = calculateExpectedPnL(
        INITIAL_PRICE,
        newPrice,
        POSITION_SIZE,
        { short: {} },
        MARKET_DECIMALS
      );
      const longPnL = calculateExpectedPnL(
        INITIAL_PRICE,
        newPrice,
        POSITION_SIZE,
        { long: {} },
        MARKET_DECIMALS
      );
      const expectedCombinedPnL = shortPnL + longPnL;

      const participant = await getProgram().account.participant.fetch(
        participantPDA
      );

      console.log("Multiple Positions PnL:", {
        shortPnL,
        longPnL,
        expectedCombinedPnL,
        actualCombinedPnL: participant.unrealizedPnl.toString(),
        totalEquity: (
          participant.virtualBalance.toNumber() +
          participant.unrealizedPnl.toNumber()
        ).toString(),
      });

      expect(participant.unrealizedPnl.toString()).to.equal(
        expectedCombinedPnL.toString()
      );
    });
  });

  // Helper function to refresh participant with all positions
  async function refreshParticipantWithPositions() {
    const participant = await getProgram().account.participant.fetch(
      participantPDA
    );
    const positionKeys = participant.positions;

    // Prepare remaining accounts: [position_0, oracle_0, position_1, oracle_1, ...]
    const remainingAccounts = [];
    for (const positionKey of positionKeys) {
      remainingAccounts.push({
        pubkey: positionKey,
        isSigner: false,
        isWritable: true,
      });
      remainingAccounts.push({
        pubkey: pdas.priceFeedPDA,
        isSigner: false,
        isWritable: false,
      });
    }

    const tx = await getProgram()
      .methods.refreshParticipant()
      .accounts({
        signer: accounts.user1.publicKey,
        participant: participantPDA,
        user: accounts.user1.publicKey,
        league: leaguePDA,
      } as any)
      .remainingAccounts(remainingAccounts)
      .signers([accounts.user1])
      .rpc();

    console.log("✅ Refresh participant tx:", tx);
    return tx;
  }
});
