import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tdf } from "../target/types/tdf";
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
  treasury: Keypair;
  permissionProgram: Keypair;
  oracleFeed: Keypair;
  baseCurrency: Keypair;
  entryTokenMint: PublicKey;
}

// Test PDAs interface
export interface TestPDAs {
  globalStatePDA: PublicKey;
  marketPDA: PublicKey;
  leaguePDA: PublicKey;
  participantPDA: PublicKey;
  positionPDA: PublicKey;
}

// Global test state
export class GlobalTestState {
  private static instance: GlobalTestState;
  private _program: Program<Tdf> | null = null;
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
    this._provider = provider;

    // Initialize test accounts
    this._accounts = {
      admin: Keypair.generate(),
      user1: Keypair.generate(),
      user2: Keypair.generate(),
      treasury: Keypair.generate(),
      permissionProgram: Keypair.generate(),
      oracleFeed: Keypair.generate(),
      baseCurrency: Keypair.generate(),
      entryTokenMint: PublicKey.default, // Will be set after creation
    };

    console.log("📝 Generated test accounts");
    console.log("Admin:", this._accounts.admin.publicKey.toString());
    console.log("User1:", this._accounts.user1.publicKey.toString());
    console.log("User2:", this._accounts.user2.publicKey.toString());

    // Airdrop SOL to test accounts
    console.log("💰 Airdropping SOL to test accounts...");
    await this.airdropToAccounts();

    // Wait for airdrops to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify airdrops
    const adminBalance = await this._provider!.connection.getBalance(this._accounts.admin.publicKey);
    console.log("Admin balance:", adminBalance / anchor.web3.LAMPORTS_PER_SOL, "SOL");

    // Create entry token mint
    console.log("🪙 Creating entry token mint...");
    this._accounts.entryTokenMint = await this.createEntryTokenMint();

    // Calculate PDAs
    this._pdas = {
      globalStatePDA: PublicKey.findProgramAddressSync(
        [Buffer.from("global_state")],
        this._program!.programId
      )[0],
    };

    console.log("📍 Global State PDA:", this._pdas.globalStatePDA.toString());
    console.log("✅ Global test environment initialized successfully");

    this._initialized = true;
  }

  private async airdropToAccounts(): Promise<void> {
    const airdropPromises = [
      this._provider!.connection.requestAirdrop(this._accounts!.admin.publicKey, TEST_CONFIG.AIRDROP_AMOUNT),
      this._provider!.connection.requestAirdrop(this._accounts!.user1.publicKey, TEST_CONFIG.AIRDROP_AMOUNT),
      this._provider!.connection.requestAirdrop(this._accounts!.user2.publicKey, TEST_CONFIG.AIRDROP_AMOUNT),
      this._provider!.connection.requestAirdrop(this._accounts!.treasury.publicKey, TEST_CONFIG.AIRDROP_AMOUNT),
    ];

    await Promise.all(airdropPromises);
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
      const mintInfo = await this._provider!.connection.getAccountInfo(entryTokenMint);
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
      throw new Error("Test environment not initialized. Call initialize() first.");
    }
    return this._program;
  }

  public get provider(): anchor.AnchorProvider {
    if (!this._provider) {
      throw new Error("Test environment not initialized. Call initialize() first.");
    }
    return this._provider;
  }

  public get accounts(): TestAccounts {
    if (!this._accounts) {
      throw new Error("Test environment not initialized. Call initialize() first.");
    }
    return this._accounts;
  }

  public get pdas(): Partial<TestPDAs> {
    if (!this._pdas) {
      throw new Error("Test environment not initialized. Call initialize() first.");
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

  public createPositionPDA(league: PublicKey, user: PublicKey, market: PublicKey, seqNum: number = 0): PublicKey {
    // Convert seqNum to little-endian bytes (8 bytes)
    const seqNumBuffer = Buffer.alloc(8);
    seqNumBuffer.writeBigUInt64LE(BigInt(seqNum));
    
    return PublicKey.findProgramAddressSync(
      [Buffer.from("position"), league.toBuffer(), user.toBuffer(), seqNumBuffer],
      this._program!.programId
    )[0];
  }

  public async getRewardVaultATA(entryTokenMint: PublicKey, leaguePDA: PublicKey): Promise<PublicKey> {
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

  public async verifyUserTokenBalance(userTokenAccount: PublicKey, expectedAmount?: number): Promise<void> {
    const userTokenBalance = await getAccount(this._provider!.connection, userTokenAccount);
    console.log("User token balance:", userTokenBalance.amount.toString());
    
    if (expectedAmount) {
      if (userTokenBalance.amount.toString() !== expectedAmount.toString()) {
        throw new Error(`Expected ${expectedAmount} tokens, got ${userTokenBalance.amount.toString()}`);
      }
    }
  }
}

// Global instance
export const globalTestState = GlobalTestState.getInstance();

// Convenience exports
export const getProgram = () => globalTestState.program;
export const getProvider = () => globalTestState.provider;
export const getAccounts = () => globalTestState.accounts;
export const getPDAs = () => globalTestState.pdas;
