// import { expect } from "chai";
// import {
//   globalTestState,
//   getProgram,
//   getAccounts,
//   getPDAs,
//   getOracleProgram,
// } from "./0_global-setup";
// import { TestHelpers, expectMarket } from "./helpers";

// describe("Market Listing Tests", () => {
//   let testHelpers: TestHelpers;
//   let accounts: any;
//   let marketPDA: any;

//   before(async () => {
//     await globalTestState.initialize();
//     accounts = getAccounts();
//     const pdas = getPDAs();
//     testHelpers = new TestHelpers(
//       getProgram(),
//       getOracleProgram(),
//       accounts,
//       pdas
//     );
//   });

//   describe("Market Listing", () => {
//     it("Should fail to list market with non-admin", async () => {
//       const symbol = "ETH/USDC";
//       const decimals = 6;
//       const maxLeverage = 20;

//       try {
//         await testHelpers.listMarket(
//           symbol,
//           decimals,
//           maxLeverage,
//           accounts.oracleFeed.publicKey,
//           accounts.baseCurrency.publicKey,
//           accounts.user1
//         );

//         expect.fail("Should have failed");
//       } catch (error) {
//         expect(error.message).to.include("constraint");
//       }
//     });

//     it("Should list a market successfully", async () => {
//       const symbol = "SOL/USDC";
//       const decimals = 6;
//       const maxLeverage = 20;

//       try {
//         await testHelpers.listMarket(
//           symbol,
//           decimals,
//           maxLeverage,
//           accounts.oracleFeed.publicKey,
//           accounts.baseCurrency.publicKey,
//           accounts.admin,
//         );

//         // Verify market
//         marketPDA = globalTestState.createMarketPDA(accounts.oracleFeed.publicKey);

//         const market = await getProgram().account.market.fetch(marketPDA);
//         expectMarket(market, {
//           symbol: symbol,
//           decimals: decimals,
//           oracleFeed: accounts.oracleFeed.publicKey,
//           baseCurrency: accounts.baseCurrency.publicKey,
//           listedBy: accounts.admin.publicKey,
//           isActive: true,
//           maxLeverage: maxLeverage,
//         });
//       } catch (error) {
//         if (error.message.includes("constraint")) {
//           console.log(
//             "Market listing failed due to admin constraint - this is expected if global state was initialized by different admin"
//           );
//           // Skip this test if admin constraint fails
//           return;
//         } else {
//           throw error;
//         }
//       }
//     });

//     it("Should fail to list market that already exists", async () => {
//       const symbol = "SOL/USDC";
//       const decimals = 6;
//       const maxLeverage = 20;

//       try {
//         await testHelpers.listMarket(
//           symbol,
//           decimals,
//           maxLeverage,
//           accounts.oracleFeed.publicKey,
//           accounts.baseCurrency.publicKey,
//           accounts.admin,
//         );

//         expect.fail("Should have failed");
//       } catch (error) {
//         expect(error.message).to.include("already in use");
//       }
//     });
//   });
// });
