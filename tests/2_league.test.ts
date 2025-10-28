// import { expect } from "chai";
// import { getAccount } from "@solana/spl-token";
// import { getProvider } from "@coral-xyz/anchor";
// import {
//   globalTestState,
//   getProgram,
//   getOracleProgram,
//   getAccounts,
//   getPDAs,
//   TEST_CONFIG,
// } from "./0_global-setup";
// import { TestHelpers, expectLeague } from "./helpers";

// describe("League Tests", () => {
//   let testHelpers: TestHelpers;
//   let accounts: any;
//   let pdas: any;
//   let leaguePDA: any;
//   let participantPDA: any;
//   let nonce: number = 0;

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

//     // Create marketPDA for league tests
//     const marketPDA = globalTestState.createMarketPDA(
//       accounts.oracleFeed.publicKey
//     );
//     pdas.marketPDA = marketPDA;
//   });

//   describe("League Creation", () => {
//     it("Should create a league successfully", async () => {
//       console.log("🏆 Testing league creation...");
//       console.log(
//         "Using entry token mint:",
//         accounts.entryTokenMint.toString()
//       );

//       const startTs = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
//       const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION; // 24 hours later
//       const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
//       const markets = [pdas.marketPDA];
//       const metadataUri = `https://example.com/league-metadata`;
//       const maxParticipants = 100;
//       const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
//       const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;

//       leaguePDA = globalTestState.createLeaguePDA(
//         accounts.user1.publicKey,
//         nonce
//       );

//       const rewardVaultPDA = await globalTestState.getRewardVaultATA(
//         accounts.entryTokenMint,
//         leaguePDA
//       );

//       console.log("League PDA:", leaguePDA.toString());
//       console.log("Reward Vault PDA:", rewardVaultPDA.toString());
//       console.log(
//         "Markets:",
//         markets.map((market) => market.toString())
//       );
//       console.log("Entry Amount:", entryAmount.toString());

//       const result = await testHelpers.createLeague(
//         accounts.user1,
//         startTs,
//         endTs,
//         entryAmount,
//         markets,
//         metadataUri,
//         maxParticipants,
//         virtualOnDeposit,
//         maxLeverage,
//         nonce
//       );

//       leaguePDA = result.leaguePDA;

//       // Verify league
//       const league = await getProgram().account.league.fetch(leaguePDA);

//       expectLeague(league, {
//         creator: accounts.user1.publicKey,
//         markets: markets,
//         startTs: startTs,
//         endTs: endTs,
//         entryTokenMint: accounts.entryTokenMint,
//         entryAmount: entryAmount,
//         rewardVault: rewardVaultPDA,
//         metadataUri: metadataUri,
//         status: { pending: {} },
//         maxParticipants: maxParticipants,
//         virtualOnDeposit: virtualOnDeposit,
//         maxLeverage: maxLeverage,
//       });

//       nonce++;

//       console.log(
//         "✅ League created successfully with correct entry token mint"
//       );
//     });
//   });

//   describe("League Status Management", () => {
//     beforeEach(async () => {
//       // Create a league for status management tests
//       const startTs = Math.floor(Date.now() / 1000) + 3600;
//       const endTs = startTs + TEST_CONFIG.LEAGUE_DURATION;
//       const entryAmount = TEST_CONFIG.ENTRY_AMOUNT;
//       const markets = [pdas.marketPDA];
//       const metadataUri = "https://example.com/league-metadata";
//       const maxParticipants = 100;
//       const virtualOnDeposit = TEST_CONFIG.VIRTUAL_BALANCE;
//       const maxLeverage = TEST_CONFIG.MAX_LEVERAGE;

//       leaguePDA = globalTestState.createLeaguePDA(
//         accounts.user1.publicKey,
//         nonce
//       );

//       const result = await testHelpers.createLeague(
//         accounts.user1,
//         startTs,
//         endTs,
//         entryAmount,
//         markets,
//         metadataUri,
//         maxParticipants,
//         virtualOnDeposit,
//         maxLeverage,
//         nonce
//       );

//       leaguePDA = result.leaguePDA;

//       nonce++;
//     });

//     it("Should fail to join league when status is not Active", async () => {
//       console.log("❌ Testing join league failure when not active...");

//       const amount = TEST_CONFIG.ENTRY_AMOUNT;
//       participantPDA = globalTestState.createParticipantPDA(
//         leaguePDA,
//         accounts.user2.publicKey
//       );

//       try {
//         await testHelpers.joinLeague(
//           accounts.user2,
//           leaguePDA,
//           participantPDA,
//           amount
//         );

//         expect.fail("Should have failed");
//       } catch (error) {
//         console.log(error.message);
//         expect(error.message).to.include("League is not active");
//         console.log("✅ Correctly failed to join league when not active");
//       }
//     });

//     it("Should fail for non-creator to start league before start time", async () => {
//       console.log(
//         "❌ Testing start league failure for non-creator before start time..."
//       );

//       try {
//         await testHelpers.startLeague(leaguePDA, accounts.user2);

//         expect.fail("Should have failed");
//       } catch (error) {
//         expect(error.message).to.include("Not creator");
//         console.log(
//           "✅ Correctly failed to start league for non-creator before start time"
//         );
//       }
//     });

//     it("Should allow creator to start league before start time", async () => {
//       console.log("🏁 Testing creator can start league before start time...");

//       const tx = await testHelpers.startLeague(leaguePDA, accounts.user1);

//       console.log("✅ Start league tx:", tx);

//       // Verify league status changed to Active
//       const league = await getProgram().account.league.fetch(leaguePDA);
//       expect(league.status).to.deep.equal({ active: {} });
//       console.log("✅ League started successfully by creator");
//     });

//     describe("League Joining", () => {
//       beforeEach(async () => {
//         // Start the league first
//         await testHelpers.startLeague(leaguePDA, accounts.user1);
//       });

//       it("Should allow user to join league after start", async () => {
//         console.log("👤 Testing user joining league...");
//         console.log(
//           "Using entry token mint:",
//           accounts.entryTokenMint.toString()
//         );

//         const amount = TEST_CONFIG.ENTRY_AMOUNT;
//         participantPDA = globalTestState.createParticipantPDA(
//           leaguePDA,
//           accounts.user1.publicKey
//         );

//         console.log("Participant PDA:", participantPDA.toString());

//         // Create user's associated token account and mint tokens
//         console.log("🪙 Creating user associated token account...");
//         const userTokenAccount = await globalTestState.setupUserTokenAccount(
//           accounts.user1,
//           accounts.entryTokenMint,
//           accounts.admin,
//           10000000 // 10 tokens
//         );

//         console.log("User Token Account:", userTokenAccount.toString());

//         // Verify user has tokens before joining
//         const userTokenBalanceBefore = await getAccount(
//           getProvider().connection,
//           userTokenAccount
//         );
//         console.log(
//           "User token balance before join:",
//           userTokenBalanceBefore.amount.toString()
//         );
//         expect(userTokenBalanceBefore.amount.toString()).to.equal("10000000");

//         const rewardVaultAta = await globalTestState.getRewardVaultATA(
//           accounts.entryTokenMint,
//           leaguePDA
//         );

//         // Verify reward vault balance before joining
//         const rewardVaultBalanceBefore = await getAccount(
//           getProvider().connection,
//           rewardVaultAta
//         );
//         console.log(
//           "Reward vault balance before join:",
//           rewardVaultBalanceBefore.amount.toString()
//         );
//         console.log("Reward Vault ATA:", rewardVaultAta.toString());
//         console.log("Join amount:", amount.toString());

//         // joinLeague now uses existing token account without minting additional tokens
//         const tx = await testHelpers.joinLeague(
//           accounts.user1,
//           leaguePDA,
//           participantPDA,
//           amount
//         );

//         console.log("✅ Join league tx:", tx);

//         // Verify user token balance after joining (should be reduced by entry amount)
//         const userTokenBalanceAfter = await getAccount(
//           getProvider().connection,
//           userTokenAccount
//         );
//         console.log(
//           "User token balance after join:",
//           userTokenBalanceAfter.amount.toString()
//         );

//         const expectedUserBalance =
//           Number(userTokenBalanceBefore.amount) - amount;
//         expect(userTokenBalanceAfter.amount.toString()).to.equal(
//           expectedUserBalance.toString()
//         );
//         console.log("✅ User token balance correctly deducted by entry amount");

//         // Verify reward vault balance after joining (should be increased by entry amount)
//         const rewardVaultBalanceAfter = await getAccount(
//           getProvider().connection,
//           rewardVaultAta
//         );
//         console.log(
//           "Reward vault balance after join:",
//           rewardVaultBalanceAfter.amount.toString()
//         );

//         const expectedVaultBalance =
//           Number(rewardVaultBalanceBefore.amount) + amount;
//         expect(rewardVaultBalanceAfter.amount.toString()).to.equal(
//           expectedVaultBalance.toString()
//         );
//         console.log(
//           "✅ Reward vault balance correctly increased by entry amount"
//         );

//         // Verify participant
//         const participant = await getProgram().account.participant.fetch(
//           participantPDA
//         );
//         expect(participant.league.toString()).to.equal(leaguePDA.toString());
//         expect(participant.user.toString()).to.equal(
//           accounts.user1.publicKey.toString()
//         );
//         expect(participant.virtualBalance.toString()).to.equal(
//           TEST_CONFIG.VIRTUAL_BALANCE.toString()
//         ); // Default virtual balance
//         expect(participant.claimed).to.be.false;

//         console.log(
//           "✅ User successfully joined league with correct token usage"
//         );
//       });

//       it("Should fail to join league with insufficient amount", async () => {
//         const insufficientAmount = 500000; // 0.5 token (less than required)
//         participantPDA = globalTestState.createParticipantPDA(
//           leaguePDA,
//           accounts.user2.publicKey
//         );

//         // Create user's associated token account and mint tokens
//         const userTokenAccount = await globalTestState.setupUserTokenAccount(
//           accounts.user2,
//           accounts.entryTokenMint,
//           accounts.admin,
//           10000000 // 10 tokens
//         );

//         try {
//           await testHelpers.joinLeague(
//             accounts.user2,
//             leaguePDA,
//             participantPDA,
//             insufficientAmount
//           );

//           expect.fail("Should have failed");
//         } catch (error) {
//           expect(error.message).to.include("InsufficientEntryAmount");
//         }
//       });

//       it("Should fail for non-creator to close league before end time", async () => {
//         // Try to close league with non-creator (user2)
//         try {
//           await testHelpers.closeLeague(leaguePDA, accounts.user2);

//           expect.fail("Should have failed");
//         } catch (error) {
//           expect(error.message).to.include("NotCreator");
//           console.log(
//             "✅ Correctly failed for non-creator to close league before end time"
//           );
//         }
//       });

//       it("Should allow creator to close league before end time", async () => {
//         console.log("🔒 Testing creator can close league before end time...");

//         await testHelpers.closeLeague(leaguePDA, accounts.user1);

//         // Verify league status changed to Closed
//         const league = await getProgram().account.league.fetch(leaguePDA);
//         expect(league.status).to.deep.equal({ closed: {} });
//         console.log("✅ League closed successfully by creator");
//       });

//       it("Should fail to join league after it's closed", async () => {
//         console.log("❌ Testing join league failure after closed...");

//         // Close the league first
//         await testHelpers.closeLeague(leaguePDA, accounts.user1);

//         const amount = TEST_CONFIG.ENTRY_AMOUNT;
//         participantPDA = globalTestState.createParticipantPDA(
//           leaguePDA,
//           accounts.user2.publicKey
//         );

//         // Create user's associated token account and mint tokens
//         await globalTestState.setupUserTokenAccount(
//           accounts.user2,
//           accounts.entryTokenMint,
//           accounts.admin,
//           10000000 // 10 tokens
//         );

//         try {
//           await testHelpers.joinLeague(
//             accounts.user2,
//             leaguePDA,
//             participantPDA,
//             amount
//           );

//           expect.fail("Should have failed");
//         } catch (error) {
//           expect(error.message).to.include("League is not active");
//           console.log("✅ Correctly failed to join league after it's closed");
//         }
//       });
//     });
//   });
// });
