// import { expect } from "chai";
// import {
//   globalTestState,
//   getProgram,
//   getOracleProgram,
//   getAccounts,
//   getPDAs,
//   TEST_CONFIG,
// } from "./0_global-setup";
// import { TestHelpers } from "./helpers";

// describe("Position Tests", () => {
//   let testHelpers: TestHelpers;
//   let accounts: any;
//   let pdas: any;
//   let leaguePDA: any;
//   let participantPDA: any;
//   let positionPDA0: any;
//   let positionPDA1: any;
//   let nonce: number = 10;
//   let SIZE_TOO_LARGE_TO_OPEN_POSITION = 100_000_000_000;
//   let SIZE_TO_OPEN_POSITION = 50_000_000;
//   let SIZE_TO_UPDATE_POSITION_SMALL = 10_000_000;
//   let SIZE_TO_UPDATE_POSITION_LARGE = 100_000_000_000;

//   // Initialize league before position tests
//   before(async () => {
//     await globalTestState.initialize();
//     accounts = getAccounts();
//     pdas = getPDAs();
//     testHelpers = new TestHelpers(
//       getProgram(),
//       getOracleProgram(),
//       accounts,
//       pdas
//     );

//     // First list the market
//     const symbol = "SOL/USDC";
//     const decimals = 6;

//     await testHelpers.listMarket(
//       symbol,
//       decimals,
//       TEST_CONFIG.MAX_LEVERAGE,
//       pdas.priceFeedPDA,
//       accounts.baseCurrency.publicKey,
//       accounts.admin
//     );
//       // Now create marketPDA with the Oracle price feed
//     const marketPDA = globalTestState.createMarketPDA(
//       pdas.priceFeedPDA
//     );
//     pdas.marketPDA = marketPDA;

//     const startTs = Math.floor(Date.now() / 1000);
//     const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
//     const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
//     const markets = [marketPDA];
//     const metadataUri = "https://example.com/new-league";
//     const maxParticipants = 100;
//     const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
//     const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;

//     leaguePDA = globalTestState.createLeaguePDA(
//       accounts.user1.publicKey,
//       nonce
//     );

//     await testHelpers.createLeague(
//       accounts.user1,
//       startTs,
//       endTs,
//       entryAmount,
//       markets,
//       metadataUri,
//       maxParticipants,
//       virtualOnDeposit,
//       maxLeverage,
//       nonce
//     );

//     nonce++;

//     // start league
//     await testHelpers.startLeague(leaguePDA, accounts.user1);

//     // join league
//     await globalTestState.setupUserTokenAccount(
//       accounts.user1,
//       accounts.entryTokenMint,
//       accounts.admin,
//       10000000 // 10 tokens
//     );

//     participantPDA = globalTestState.createParticipantPDA(
//       leaguePDA,
//       accounts.user1.publicKey
//     );

//     await testHelpers.joinLeague(
//       accounts.user1,
//       leaguePDA,
//       participantPDA,
//       TEST_CONFIG.ENTRY_AMOUNT
//     );

//     // Calculate PDAs for position tests
//     positionPDA0 = globalTestState.createPositionPDA(
//       leaguePDA,
//       accounts.user1.publicKey,
//       marketPDA,
//       0
//     );
//     positionPDA1 = globalTestState.createPositionPDA(
//       leaguePDA,
//       accounts.user1.publicKey,
//       marketPDA,
//       1
//     );
//   });

//   describe("Open Position", () => {
//     it("Should fail to open position with insufficient margin", async () => {
//       console.log("❌ Testing insufficient margin failure...");

//       const direction = { long: {} };
//       const leverage = 1; // Low leverage

//       try {
//         // check oracle price
//         const oraclePrice = await testHelpers.getOraclePrice(
//           pdas.priceFeedPDA
//         );
//         console.log("Oracle price:", oraclePrice);

//         await testHelpers.openPosition(
//           accounts.user1,
//           leaguePDA,
//           pdas.marketPDA,
//           pdas.priceFeedPDA,
//           participantPDA,
//           positionPDA0,
//           direction,
//           SIZE_TOO_LARGE_TO_OPEN_POSITION,
//           leverage,
//           0
//         );

//         expect.fail("Should have failed");
//       } catch (error) {
//         console.log(error.message);
//         expect(error.message).to.include("Insufficient margin");
//         console.log("✅ Correctly failed with insufficient margin");
//       }
//     });

//     it("Should fail to open position with invalid leverage", async () => {
//       console.log("❌ Testing invalid leverage failure...");

//       const direction = { long: {} };
//       const leverage = TEST_CONFIG.MAX_LEVERAGE + 1; // Exceeds max leverage of 20

//       try {
//         await testHelpers.openPosition(
//           accounts.user1,
//           leaguePDA,
//           pdas.marketPDA,
//           pdas.priceFeedPDA,
//           participantPDA,
//           positionPDA0,
//           direction,
//           SIZE_TO_OPEN_POSITION,
//           leverage,
//           0
//         );

//         expect.fail("Should have failed");
//       } catch (error) {
//         console.log(error.message);
//         expect(error.message).to.include("Invalid leverage");
//         console.log("✅ Correctly failed with invalid leverage");
//       }
//     });

//     it("Should fail to open position in not joined league", async () => {
//       console.log("❌ Testing position opening in not joined league...");

//       let participantPDA2 = globalTestState.createParticipantPDA(
//         leaguePDA,
//         accounts.user2.publicKey
//       );

//       try {
//         await testHelpers.openPosition(
//           accounts.user2,
//           leaguePDA,
//           pdas.marketPDA,
//           pdas.priceFeedPDA,
//           participantPDA2,
//           positionPDA0,
//           { long: {} },
//           SIZE_TO_OPEN_POSITION,
//           5,
//           0
//         );

//         expect.fail("Should have failed");
//       } catch (error) {
//         expect(error.message).to.include(
//           "The program expected this account to be already initialized."
//         );
//         console.log(
//           "✅ Correctly failed to open position in non-active league"
//         );
//       }
//     });

//     it("Should open a long position successfully", async () => {
//       console.log("📈 Testing long position opening...");

//       const direction = { long: {} };
//       const leverage = 5;

//       const tx = await testHelpers.openPosition(
//         accounts.user1,
//         leaguePDA,
//         pdas.marketPDA,
//         pdas.priceFeedPDA,
//         participantPDA,
//         positionPDA0,
//         direction,
//         SIZE_TO_OPEN_POSITION,
//         leverage,
//         0
//       );

//       console.log("✅ Open position tx:", tx);

//       // Verify position was created
//       const position = await getProgram().account.position.fetch(positionPDA0);
//       expect(position.league.toString()).to.equal(leaguePDA.toString());
//       expect(position.user.toString()).to.equal(
//         accounts.user1.publicKey.toString()
//       );
//       expect(position.market.toString()).to.equal(pdas.marketPDA.toString());
//       expect(position.direction).to.deep.equal({ long: {} });
//       expect(position.size.toString()).to.equal(
//         SIZE_TO_OPEN_POSITION.toString()
//       );
//       expect(position.leverage).to.equal(leverage);
//       expect(position.entryPrice.toString()).to.equal("100000000"); // From oracle mock
//       expect(position.openedAt.toNumber()).to.be.greaterThan(0);
//       expect(position.closedAt.toNumber()).to.equal(0);

//       // Verify participant equity was reduced by margin
//       const participant = await getProgram().account.participant.fetch(
//         participantPDA
//       );
//       const expectedMargin = position.notional.toNumber() / leverage;
//       const expectedAvailableBalance =
//         TEST_CONFIG.VIRTUAL_BALANCE - expectedMargin; // virtual_balance - margin
//       const participantAvailableBalance =
//         participant.virtualBalance.toNumber() -
//         participant.usedMargin.toNumber();
//       expect(participantAvailableBalance.toString()).to.equal(
//         expectedAvailableBalance.toString()
//       );

//       console.log("✅ Long position opened successfully");
//     });

//     it("Should fail to open position with invalid sequence number", async () => {
//       console.log(
//         "❌ Testing position opening with invalid sequence number..."
//       );

//       // Try to open position with wrong sequence number (use 0 instead of currentSeq)
//       try {
//         await testHelpers.openPosition(
//           accounts.user1,
//           leaguePDA,
//           pdas.marketPDA,
//           pdas.priceFeedPDA,
//           participantPDA,
//           positionPDA1,
//           { long: {} },
//           SIZE_TO_OPEN_POSITION,
//           5,
//           0 // Wrong sequence number
//         );

//         expect.fail(
//           "Should have failed to open position with invalid sequence number"
//         );
//       } catch (error) {
//         expect(error.message).to.include("Invalid position sequence");
//         console.log(
//           "✅ Correctly failed to open position with invalid sequence number"
//         );
//       }
//     });
//   });

//   describe("Increase Position Size", () => {
//     it("Should increase position size successfully", async () => {
//       console.log("📈 Testing position size increase...");

//       const initialPosition = await getProgram().account.position.fetch(
//         positionPDA0
//       );
//       const initialSize = initialPosition.size;

//       const tx = await testHelpers.increasePositionSize(
//         accounts.user1,
//         leaguePDA,
//         pdas.marketPDA,
//         pdas.priceFeedPDA,
//         participantPDA,
//         positionPDA0,
//         SIZE_TO_UPDATE_POSITION_SMALL
//       );

//       console.log("✅ Increase position size tx:", tx);

//       // Verify position was updated
//       const updatedPosition = await getProgram().account.position.fetch(
//         positionPDA0
//       );
//       expect(updatedPosition.size.toString()).to.equal(
//         (initialSize.toNumber() + SIZE_TO_UPDATE_POSITION_SMALL).toString()
//       );
//       expect(updatedPosition.direction).to.deep.equal({ long: {} });

//       console.log("✅ Position size increased successfully");
//     });

//     it("Should fail to increase position size with insufficient margin", async () => {
//       console.log(
//         "❌ Testing position size increase with insufficient margin..."
//       );

//       try {
//         await testHelpers.increasePositionSize(
//           accounts.user1,
//           leaguePDA,
//           pdas.marketPDA,
//           pdas.priceFeedPDA,
//           participantPDA,
//           positionPDA0,
//           SIZE_TO_UPDATE_POSITION_LARGE
//         );

//         expect.fail("Should have failed with insufficient margin");
//       } catch (error) {
//         console.log(error.message);
//         expect(error.message).to.include("Insufficient margin");
//         console.log("✅ Correctly failed with insufficient margin");
//       }
//     });
//   });

//   describe("Decrease Position Size", () => {
//     it("Should decrease position size successfully", async () => {
//       console.log("📉 Testing position size decrease...");

//       const initialPosition = await getProgram().account.position.fetch(
//         positionPDA0
//       );
//       const initialSize = initialPosition.size;

//       const tx = await testHelpers.decreasePositionSize(
//         accounts.user1,
//         leaguePDA,
//         pdas.priceFeedPDA,
//         participantPDA,
//         positionPDA0,
//         SIZE_TO_UPDATE_POSITION_SMALL
//       );

//       console.log("✅ Decrease position size tx:", tx);

//       // Verify position was updated
//       const updatedPosition = await getProgram().account.position.fetch(
//         positionPDA0
//       );
//       expect(updatedPosition.size.toString()).to.equal(
//         (initialSize.toNumber() - SIZE_TO_UPDATE_POSITION_SMALL).toString()
//       );
//       expect(updatedPosition.direction).to.deep.equal({ long: {} });

//       console.log("✅ Position size decreased successfully");
//     });

//     it("Should fail to decrease position size with invalid size", async () => {
//       console.log("❌ Testing position size decrease with invalid size...");

//       try {
//         await testHelpers.decreasePositionSize(
//           accounts.user1,
//           leaguePDA,
//           pdas.priceFeedPDA,
//           participantPDA,
//           positionPDA0,
//           SIZE_TOO_LARGE_TO_OPEN_POSITION
//         );

//         expect.fail("Should have failed with invalid size");
//       } catch (error) {
//         expect(error.message).to.include("Invalid reduce size");
//         console.log("✅ Correctly failed with invalid size");
//       }
//     });

//     it("Should close position when decreasing size equals position size", async () => {
//       console.log("🔒 Testing position closure when decreasing full size...");

//       const initialPosition = await getProgram().account.position.fetch(
//         positionPDA0
//       );
//       const initialSize = initialPosition.size;

//       const tx = await testHelpers.decreasePositionSize(
//         accounts.user1,
//         leaguePDA,
//         pdas.priceFeedPDA,
//         participantPDA,
//         positionPDA0,
//         initialSize.toNumber()
//       );

//       console.log("✅ Close position tx:", tx);

//       // Verify position was closed
//       const updatedPosition = await getProgram().account.position.fetch(
//         positionPDA0
//       );
//       expect(updatedPosition.size.toString()).to.equal("0");
//       expect(updatedPosition.closedAt.toNumber()).to.be.greaterThan(0);

//       console.log("✅ Position closed successfully");
//     });
//   });
// });
