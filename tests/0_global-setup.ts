import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tdf } from "../target/types/tdf";
import { Oracle } from "../target/types/oracle";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";

// Global test configuration
export const TEST_CONFIG = {
  AIRDROP_AMOUNT: 10 * anchor.web3.LAMPORTS_PER_SOL,
  TOKEN_DECIMALS: 6,
  ENTRY_AMOUNT: 1000000, // 1 token with 6 decimals
  VIRTUAL_BALANCE: 10_000_000_000, // 10 billion with decimal 6
  MAX_LEVERAGE: 20,
  LEAGUE_DURATION: 86400, // 24 hours
};

// Test accounts interface
export interface TestAccounts {
  admin: Keypair;
  user1: Keypair;
  user2: Keypair;
  user3: Keypair;
  user4: Keypair;
  user5: Keypair;
  treasury: Keypair;
  permissionProgram: Keypair;
  oracleFeed: Keypair;
  baseCurrency: Keypair;
  entryTokenMint: PublicKey;
  ERProgram: PublicKey;
}

// Test PDAs interface
export interface TestPDAs {
  globalStatePDA: PublicKey;
  priceFeedPDA: PublicKey;
  marketPDA: PublicKey;
  leaguePDA: PublicKey;
  participantPDA: PublicKey;
  positionPDA: PublicKey;
  leaderboardPDA: PublicKey;
}

// Global test state
export class GlobalTestState {
  private static instance: GlobalTestState;
  private _program: Program<Tdf> | null = null;
  private _oracleProgram: Program<Oracle> | null = null;
  private _provider: anchor.AnchorProvider | null = null;
  private _accounts: TestAccounts | null = null;
  private _pdas: Partial<TestPDAs> | null = null;
  private _initialized: boolean = false;

  private constructor() {}

  public static getInstance(): GlobalTestState {
    if (!GlobalTestState.instance) {
      GlobalTestState.instance = new GlobalTestState();
    }
    return GlobalTestState.instance;
  }

  public async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    console.log("🚀 Initializing global test environment...");

    // Configure the client to use the local cluster
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    this._program = anchor.workspace.tdf as Program<Tdf>;
    this._oracleProgram = anchor.workspace.oracle as Program<Oracle>;
    this._provider = provider;

    // Initialize test accounts
    this._accounts = {
      admin: Keypair.generate(),
      user1: Keypair.generate(),
      user2: Keypair.generate(),
      user3: Keypair.generate(),
      user4: Keypair.generate(),
      user5: Keypair.generate(),
      treasury: Keypair.generate(),
      permissionProgram: Keypair.generate(),
      oracleFeed: Keypair.generate(),
      baseCurrency: Keypair.generate(),
      entryTokenMint: PublicKey.default, // Will be set after creation
      ERProgram: new PublicKey("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev"), // Local ephemeral rollups program
    };

    console.log("📝 Generated test accounts");
    console.log("Admin:", this._accounts.admin.publicKey.toString());
    console.log("User1:", this._accounts.user1.publicKey.toString());
    console.log("User2:", this._accounts.user2.publicKey.toString());
    console.log("User3:", this._accounts.user3.publicKey.toString());
    console.log("User4:", this._accounts.user4.publicKey.toString());
    console.log("User5:", this._accounts.user5.publicKey.toString());

    // Airdrop SOL to test accounts
    console.log("💰 Airdropping SOL to test accounts...");
    await this.airdropToAccounts();

    // Calculate PDAs
    this._pdas = {
      globalStatePDA: PublicKey.findProgramAddressSync(
        [Buffer.from("global_state")],
        this._program!.programId
      )[0],
      priceFeedPDA: PublicKey.findProgramAddressSync(
        [Buffer.from("price_feed")],
        this._oracleProgram!.programId
      )[0],
    };

    // Wait for airdrops to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify airdrops
    const adminBalance = await this._provider!.connection.getBalance(
      this._accounts.admin.publicKey
    );
    console.log(
      "Admin balance:",
      adminBalance / anchor.web3.LAMPORTS_PER_SOL,
      "SOL"
    );

    try {
      // Initialize global state
      console.log("🔮 Initializing global state...");
      await this.initializeGlobalState();
    } catch (error) {
      if (error.message.includes("already in use")) {
        console.log("Global state already initialized, skipping initialization");
      } else {
        console.error("❌ Failed to initialize global state:", error);
        throw error;
      }
    }
    try {
      // Deploy oracle program and initialize price feed
      console.log("🔮 Setting up oracle program...");
      await this.setupOracleProgram();
    } catch (error) {
      if (error.message.includes("already in use")) {
        console.log("Oracle program already initialized, skipping initialization");
      } else {
        console.error("❌ Failed to initialize oracle program:", error);
        throw error;
      }
    }
    try {
      // Create entry token mint
      console.log("🪙 Creating entry token mint...");
      this._accounts.entryTokenMint = await this.createEntryTokenMint();
    } catch (error) {
      if (error.message.includes("already in use")) {
        console.log("Entry token mint already created, skipping creation");
      } else {
        console.error("❌ Failed to create entry token mint:", error);
        throw error;
      }
    }
    this._initialized = true;
  }

  private async airdropToAccounts(): Promise<void> {
    const airdropPromises = [
      this._provider!.connection.requestAirdrop(
        this._accounts!.admin.publicKey,
        TEST_CONFIG.AIRDROP_AMOUNT
      ),
      this._provider!.connection.requestAirdrop(
        this._accounts!.user1.publicKey,
        TEST_CONFIG.AIRDROP_AMOUNT
      ),
      this._provider!.connection.requestAirdrop(
        this._accounts!.user2.publicKey,
        TEST_CONFIG.AIRDROP_AMOUNT
      ),
      this._provider!.connection.requestAirdrop(
        this._accounts!.user3.publicKey,
        TEST_CONFIG.AIRDROP_AMOUNT
      ),
      this._provider!.connection.requestAirdrop(
        this._accounts!.user4.publicKey,
        TEST_CONFIG.AIRDROP_AMOUNT
      ),
      this._provider!.connection.requestAirdrop(
        this._accounts!.user5.publicKey,
        TEST_CONFIG.AIRDROP_AMOUNT
      ),
      this._provider!.connection.requestAirdrop(
        this._accounts!.treasury.publicKey,
        TEST_CONFIG.AIRDROP_AMOUNT
      ),
    ];

    const signatures = await Promise.all(airdropPromises);

    // Wait for confirmations
    for (const signature of signatures) {
      await this._provider!.connection.confirmTransaction(signature);
    }
  }

  private async initializeGlobalState(): Promise<void> {
    const tx = await this._program.methods
      .initializeGlobalState(
        100,
        this._accounts.treasury.publicKey,
        this._accounts.permissionProgram.publicKey
      )
      .accounts({
        globalState: this._pdas.globalStatePDA,
        admin: this._accounts.admin.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([this._accounts.admin])
      .rpc();

    console.log("Global state initialization tx:", tx);
  }

  private async setupOracleProgram(): Promise<void> {
    try {
      const priceFeedPDA = this._pdas.priceFeedPDA;

      // Check if price feed already exists
      const existingAccount = await this._provider!.connection.getAccountInfo(
        priceFeedPDA
      );
      if (existingAccount) {
        console.log("Price feed already exists, skipping initialization");
      } else {
        // Initialize price feed with initial price of 100000 (100.000 with 3 decimals)
        const initialPrice = 100_000_000; // 100.000 with 6 decimals

        await this._oracleProgram.methods
          .initializePriceFeed(new anchor.BN(initialPrice))
          .accounts({
            priceFeed: priceFeedPDA,
            authority: this._accounts.admin.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([this._accounts.admin])
          .rpc();

        console.log(
          "✅ Oracle price feed initialized with price: {}, PDA: {}",
          initialPrice,
          priceFeedPDA.toString()
        );
      }
    } catch (error) {
      console.error("❌ Failed to setup oracle program:", error);
      throw error;
    }
  }

  private async createEntryTokenMint(): Promise<PublicKey> {
    try {
      const entryTokenMint = await createMint(
        this._provider!.connection,
        this._accounts!.admin,
        this._accounts!.admin.publicKey, // mint authority
        null, // freeze authority (null = no freeze)
        TEST_CONFIG.TOKEN_DECIMALS
      );

      console.log("✅ Entry token mint created successfully");
      console.log("Entry Token Mint:", entryTokenMint.toString());

      // Verify the mint account
      const mintInfo = await this._provider!.connection.getAccountInfo(
        entryTokenMint
      );
      if (mintInfo) {
        console.log("✅ Mint account verified - it's a valid mint account");
      } else {
        throw new Error("Failed to verify mint account");
      }

      return entryTokenMint;
    } catch (error) {
      console.error("❌ Failed to create entry token mint:", error);
      throw error;
    }
  }

  // Getters
  public get program(): Program<Tdf> {
    if (!this._program) {
      throw new Error(
        "Test environment not initialized. Call initialize() first."
      );
    }
    return this._program;
  }

  public get oracleProgram(): Program<Oracle> {
    if (!this._oracleProgram) {
      throw new Error(
        "Test environment not initialized. Call initialize() first."
      );
    }
    return this._oracleProgram;
  }

  public get provider(): anchor.AnchorProvider {
    if (!this._provider) {
      throw new Error(
        "Test environment not initialized. Call initialize() first."
      );
    }
    return this._provider;
  }

  public get accounts(): TestAccounts {
    if (!this._accounts) {
      throw new Error(
        "Test environment not initialized. Call initialize() first."
      );
    }
    return this._accounts;
  }

  public get pdas(): Partial<TestPDAs> {
    if (!this._pdas) {
      throw new Error(
        "Test environment not initialized. Call initialize() first."
      );
    }
    return this._pdas;
  }

  public get initialized(): boolean {
    return this._initialized;
  }

  // Helper methods
  public createMarketPDA(oracleFeed: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("market"), oracleFeed.toBuffer()],
      this._program!.programId
    )[0];
  }

  public createLeaguePDA(creator: PublicKey, nonce: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("league"), creator.toBuffer(), Buffer.from([nonce])],
      this._program!.programId
    )[0];
  }

  public createParticipantPDA(league: PublicKey, user: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("participant"), league.toBuffer(), user.toBuffer()],
      this._program!.programId
    )[0];
  }

  public createPositionPDA(
    league: PublicKey,
    user: PublicKey,
    market: PublicKey,
    seqNum: number = 0
  ): PublicKey {
    // Convert seqNum to little-endian bytes (8 bytes)
    const seqNumBuffer = Buffer.alloc(8);
    seqNumBuffer.writeBigUInt64LE(BigInt(seqNum));

    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        league.toBuffer(),
        user.toBuffer(),
        seqNumBuffer,
      ],
      this._program!.programId
    )[0];
  }

  public createLeaderboardPDA(league: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("leaderboard"), league.toBuffer()],
      this._program!.programId
    )[0];
  }

  public async getRewardVaultATA(
    entryTokenMint: PublicKey,
    leaguePDA: PublicKey
  ): Promise<PublicKey> {
    return await getAssociatedTokenAddress(
      entryTokenMint,
      leaguePDA,
      true // allowOwnerOffCurve
    );
  }

  public async setupUserTokenAccount(
    user: Keypair,
    entryTokenMint: PublicKey,
    admin: Keypair,
    amount: number = 10000000 // 10 tokens
  ): Promise<PublicKey> {
    const userTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      this._provider!.connection,
      user,
      entryTokenMint,
      user.publicKey
    );
    const userTokenAccount = userTokenAccountInfo.address;

    await mintTo(
      this._provider!.connection,
      admin,
      entryTokenMint,
      userTokenAccount,
      admin,
      amount
    );

    return userTokenAccount;
  }

  public async verifyUserTokenBalance(
    userTokenAccount: PublicKey,
    expectedAmount?: number
  ): Promise<void> {
    const userTokenBalance = await getAccount(
      this._provider!.connection,
      userTokenAccount
    );
    console.log("User token balance:", userTokenBalance.amount.toString());

    if (expectedAmount) {
      if (userTokenBalance.amount.toString() !== expectedAmount.toString()) {
        throw new Error(
          `Expected ${expectedAmount} tokens, got ${userTokenBalance.amount.toString()}`
        );
      }
    }
  }
}

// Global instance
export const globalTestState = GlobalTestState.getInstance();

// Convenience exports
export const getProgram = () => globalTestState.program;
export const getOracleProgram = () => globalTestState.oracleProgram;
export const getProvider = () => globalTestState.provider;
export const getAccounts = () => globalTestState.accounts;
export const getPDAs = () => globalTestState.pdas;
