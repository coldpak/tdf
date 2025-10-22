import { expect } from "chai";
import { SystemProgram } from "@solana/web3.js";
import { globalTestState, getProgram, getAccounts, getPDAs } from "./global-setup";
import { TestHelpers, expectGlobalState } from "./helpers";

describe("Global State Tests", () => {
  let testHelpers: TestHelpers;
  let accounts: any;
  let pdas: any;

  before(async () => {
    await globalTestState.initialize();
    accounts = getAccounts();
    pdas = getPDAs();
    testHelpers = new TestHelpers(getProgram(), accounts, pdas);
  });

  describe("Global State Initialization", () => {
    it("Should initialize global state successfully", async () => {
      const feeBps = 100; // 1%

      const tx = await testHelpers.initializeGlobalState(feeBps);

      if (tx !== "already_initialized") {
        // Verify global state
        const globalState = await getProgram().account.globalState.fetch(pdas.globalStatePDA);
        expectGlobalState(globalState, {
          admin: accounts.admin.publicKey,
          feeBps: feeBps,
          treasury: accounts.treasury.publicKey,
          permissionProgram: accounts.permissionProgram.publicKey,
        });
      } else {
        // Verify existing global state
        const globalState = await getProgram().account.globalState.fetch(pdas.globalStatePDA);
        expect(globalState).to.not.be.null;
      }
    });

    it("Should fail to initialize global state twice", async () => {
      try {
        await getProgram().methods
          .initializeGlobalState(
            100,
            accounts.treasury.publicKey,
            accounts.permissionProgram.publicKey
          )
          .accounts({
            globalState: pdas.globalStatePDA,
            admin: accounts.admin.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([accounts.admin])
          .rpc();

        expect.fail("Should have failed");
      } catch (error) {
        expect(error.message).to.include("already in use");
      }
    });
  });
});
