// import { expect } from "chai";
// import { globalTestState, getProgram, getAccounts, getPDAs, TEST_CONFIG } from "./global-setup";
// import { TestHelpers } from "./helpers";

// describe("TDF Integration Tests", () => {
//   let testHelpers: TestHelpers;
//   let accounts: any;
//   let pdas: any;

//   before(async () => {
//     await globalTestState.initialize();
//     accounts = getAccounts();
//     pdas = getPDAs();
//     testHelpers = new TestHelpers(getProgram(), accounts, pdas);
//   });

//   describe("Complete Trading Flow", () => {
//     it("Should execute complete trading flow from setup to position closing", async () => {
//       console.log("🚀 Starting complete trading flow test...");

//       // Step 1: Initialize global state
//       console.log("📋 Step 1: Initializing global state...");
//       await testHelpers.initializeGlobalState(100);

//       // Step 2: List a market
//       console.log("📈 Step 2: Listing market...");
//       const marketPDA = globalTestState.createMarketPDA(accounts.oracleFeed.publicKey);
//       await testHelpers.listMarket(
//         "SOL/USDC",
//         6,
//         20,
//         accounts.oracleFeed.publicKey,
//         accounts.baseCurrency.publicKey
//       );

//       // Step 3: Create a league
//       console.log("🏆 Step 3: Creating league...");
//       const startTs = Math.floor(Date.now() / 1000) + 3600;
//       const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
//       const leaguePDA = globalTestState.createLeaguePDA(accounts.user1.publicKey, startTs);
      
//       const result = await testHelpers.createLeague(
//         accounts.user1,
//         startTs,
//         endTs,
//         TEST_CONFIG.ENTRY_AMOUNT,
//         [marketPDA],
//         "https://example.com/integration-league",
//         100,
//         TEST_CONFIG.VIRTUAL_BALANCE,
//         TEST_CONFIG.MAX_LEVERAGE
//       );

//       // Step 4: Start the league
//       console.log("🏁 Step 4: Starting league...");
//       await testHelpers.startLeague(result.leaguePDA, accounts.user1);

//       // Step 5: Join the league
//       console.log("👤 Step 5: Joining league...");
//       const participantPDA = globalTestState.createParticipantPDA(result.leaguePDA, accounts.user1.publicKey);
//       await testHelpers.joinLeague(
//         accounts.user1,
//         result.leaguePDA,
//         participantPDA,
//         TEST_CONFIG.ENTRY_AMOUNT
//       );

//       // Step 6: Open a position
//       console.log("📊 Step 6: Opening position...");
//       const positionPDA = globalTestState.createPositionPDA(result.leaguePDA, accounts.user1.publicKey, marketPDA);
//       await testHelpers.openPosition(
//         accounts.user1,
//         result.leaguePDA,
//         marketPDA,
//         participantPDA,
//         positionPDA,
//         { long: {} },
//         1,
//         5
//       );

//       // Step 7: Update the position
//       console.log("🔄 Step 7: Updating position...");
//       await testHelpers.updatePosition(
//         accounts.user1,
//         result.leaguePDA,
//         marketPDA,
//         participantPDA,
//         positionPDA,
//         { long: {} },
//         2,
//         5
//       );

//       // Step 8: Close the position
//       console.log("🔒 Step 8: Closing position...");
//       await testHelpers.closePosition(
//         accounts.user1,
//         result.leaguePDA,
//         participantPDA,
//         positionPDA
//       );

//       // Step 9: Close the league
//       console.log("🏁 Step 9: Closing league...");
//       await getProgram().methods
//         .closeLeague()
//         .accounts({
//           league: result.leaguePDA,
//           user: accounts.user1.publicKey,
//         } as any)
//         .signers([accounts.user1])
//         .rpc();

//       console.log("✅ Complete trading flow executed successfully!");
//     });

//     it("Should handle multiple users in the same league", async () => {
//       console.log("👥 Testing multiple users in same league...");

//       // Create a league
//       const startTs = Math.floor(Date.now() / 1000) + 3600;
//       const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
//       const leaguePDA = globalTestState.createLeaguePDA(accounts.user1.publicKey, startTs);
//       const marketPDA = globalTestState.createMarketPDA(accounts.oracleFeed.publicKey);
      
//       const result = await testHelpers.createLeague(
//         accounts.user1,
//         startTs,
//         endTs,
//         TEST_CONFIG.ENTRY_AMOUNT,
//         [marketPDA],
//         "https://example.com/multi-user-league",
//         100,
//         TEST_CONFIG.VIRTUAL_BALANCE,
//         TEST_CONFIG.MAX_LEVERAGE
//       );

//       // Start the league
//       await testHelpers.startLeague(result.leaguePDA, accounts.user1);

//       // User 1 joins
//       const participant1PDA = globalTestState.createParticipantPDA(result.leaguePDA, accounts.user1.publicKey);
//       await testHelpers.joinLeague(
//         accounts.user1,
//         result.leaguePDA,
//         participant1PDA,
//         TEST_CONFIG.ENTRY_AMOUNT
//       );

//       // User 2 joins
//       const participant2PDA = globalTestState.createParticipantPDA(result.leaguePDA, accounts.user2.publicKey);
//       await testHelpers.joinLeague(
//         accounts.user2,
//         result.leaguePDA,
//         participant2PDA,
//         TEST_CONFIG.ENTRY_AMOUNT
//       );

//       // Both users open positions
//       const position1PDA = globalTestState.createPositionPDA(result.leaguePDA, accounts.user1.publicKey, marketPDA);
//       const position2PDA = globalTestState.createPositionPDA(result.leaguePDA, accounts.user2.publicKey, marketPDA);

//       await testHelpers.openPosition(
//         accounts.user1,
//         result.leaguePDA,
//         marketPDA,
//         participant1PDA,
//         position1PDA,
//         { long: {} },
//         1,
//         5
//       );

//       await testHelpers.openPosition(
//         accounts.user2,
//         result.leaguePDA,
//         marketPDA,
//         participant2PDA,
//         position2PDA,
//         { short: {} },
//         1,
//         5
//       );

//       // Verify both participants exist
//       const participant1 = await getProgram().account.participant.fetch(participant1PDA);
//       const participant2 = await getProgram().account.participant.fetch(participant2PDA);

//       expect(participant1.user.toString()).to.equal(accounts.user1.publicKey.toString());
//       expect(participant2.user.toString()).to.equal(accounts.user2.publicKey.toString());

//       console.log("✅ Multiple users successfully participated in the same league");
//     });

//     it("Should handle multiple markets in a league", async () => {
//       console.log("📊 Testing multiple markets in league...");

//       // Create multiple markets
//       const market1PDA = globalTestState.createMarketPDA(accounts.oracleFeed.publicKey);
//       const market2PDA = globalTestState.createMarketPDA(accounts.baseCurrency.publicKey); // Using different oracle

//       // List both markets
//       await testHelpers.listMarket(
//         "SOL/USDC",
//         6,
//         20,
//         accounts.oracleFeed.publicKey,
//         accounts.baseCurrency.publicKey
//       );

//       await testHelpers.listMarket(
//         "ETH/USDC",
//         6,
//         15,
//         accounts.baseCurrency.publicKey,
//         accounts.treasury.publicKey
//       );

//       // Create league with multiple markets
//       const startTs = Math.floor(Date.now() / 1000) + 3600;
//       const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
//       const leaguePDA = globalTestState.createLeaguePDA(accounts.user1.publicKey, startTs);
      
//       const result = await testHelpers.createLeague(
//         accounts.user1,
//         startTs,
//         endTs,
//         TEST_CONFIG.ENTRY_AMOUNT,
//         [market1PDA, market2PDA],
//         "https://example.com/multi-market-league",
//         100,
//         TEST_CONFIG.VIRTUAL_BALANCE,
//         TEST_CONFIG.MAX_LEVERAGE
//       );

//       // Start league and join
//       await testHelpers.startLeague(result.leaguePDA, accounts.user1);
//       const participantPDA = globalTestState.createParticipantPDA(result.leaguePDA, accounts.user1.publicKey);
//       await testHelpers.joinLeague(
//         accounts.user1,
//         result.leaguePDA,
//         participantPDA,
//         TEST_CONFIG.ENTRY_AMOUNT
//       );

//       // Open positions in both markets
//       const position1PDA = globalTestState.createPositionPDA(result.leaguePDA, accounts.user1.publicKey, market1PDA);
//       const position2PDA = globalTestState.createPositionPDA(result.leaguePDA, accounts.user1.publicKey, market2PDA);

//       await testHelpers.openPosition(
//         accounts.user1,
//         result.leaguePDA,
//         market1PDA,
//         participantPDA,
//         position1PDA,
//         { long: {} },
//         1,
//         5
//       );

//       await testHelpers.openPosition(
//         accounts.user1,
//         result.leaguePDA,
//         market2PDA,
//         participantPDA,
//         position2PDA,
//         { short: {} },
//         1,
//         5
//       );

//       // Verify both positions exist
//       const position1 = await getProgram().account.position.fetch(position1PDA);
//       const position2 = await getProgram().account.position.fetch(position2PDA);

//       expect(position1.market.toString()).to.equal(market1PDA.toString());
//       expect(position2.market.toString()).to.equal(market2PDA.toString());

//       console.log("✅ Successfully handled multiple markets in league");
//     });
//   });

//   describe("Error Handling Integration", () => {
//     it("Should handle errors gracefully in complete flow", async () => {
//       console.log("❌ Testing error handling in complete flow...");

//       // Try to join league without creating it first
//       try {
//         const fakeLeaguePDA = globalTestState.createLeaguePDA(accounts.user2.publicKey, Math.floor(Date.now() / 1000));
//         const fakeParticipantPDA = globalTestState.createParticipantPDA(fakeLeaguePDA, accounts.user2.publicKey);
        
//         await testHelpers.joinLeague(
//           accounts.user2,
//           fakeLeaguePDA,
//           fakeParticipantPDA,
//           TEST_CONFIG.ENTRY_AMOUNT
//         );

//         expect.fail("Should have failed");
//       } catch (error) {
//         expect(error.message).to.include("Account does not exist");
//         console.log("✅ Correctly handled error for non-existent league");
//       }

//       // Try to open position without joining league
//       try {
//         const leaguePDA = globalTestState.createLeaguePDA(accounts.user2.publicKey, Math.floor(Date.now() / 1000));
//         const marketPDA = globalTestState.createMarketPDA(accounts.oracleFeed.publicKey);
//         const participantPDA = globalTestState.createParticipantPDA(leaguePDA, accounts.user2.publicKey);
//         const positionPDA = globalTestState.createPositionPDA(leaguePDA, accounts.user2.publicKey, marketPDA);

//         await testHelpers.openPosition(
//           accounts.user2,
//           leaguePDA,
//           marketPDA,
//           participantPDA,
//           positionPDA,
//           { long: {} },
//           1,
//           5
//         );

//         expect.fail("Should have failed");
//       } catch (error) {
//         expect(error.message).to.include("Account does not exist");
//         console.log("✅ Correctly handled error for non-existent participant");
//       }

//       console.log("✅ Error handling working correctly in integration flow");
//     });
//   });
// });
