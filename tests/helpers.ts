import { expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  mintTo,
} from "@solana/spl-token";
import { Program, BN, getProvider } from "@coral-xyz/anchor";
import { Tdf } from "../target/types/tdf";
import { TestAccounts, TestPDAs } from "./global-setup";

// Test helper functions for common operations

export class TestHelpers {
  private program: Program<Tdf>;
  private accounts: TestAccounts;
  private pdas: Partial<TestPDAs>;

  constructor(
    program: Program<Tdf>,
    accounts: TestAccounts,
    pdas: Partial<TestPDAs>
  ) {
    this.program = program;
    this.accounts = accounts;
    this.pdas = pdas;
  }

  // Initialize global state
  async initializeGlobalState(feeBps: number = 100): Promise<string> {
    try {
      const tx = await this.program.methods
        .initializeGlobalState(
          feeBps,
          this.accounts.treasury.publicKey,
          this.accounts.permissionProgram.publicKey
        )
        .accounts({
          globalState: this.pdas.globalStatePDA!,
          admin: this.accounts.admin.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([this.accounts.admin])
        .rpc();

      console.log("Global state initialization tx:", tx);
      return tx;
    } catch (error) {
      if (error.message.includes("already in use")) {
        console.log(
          "Global state already initialized, skipping initialization"
        );
        return "already_initialized";
      } else {
        throw error;
      }
    }
  }

  // List a market
  async listMarket(
    symbol: string,
    decimals: number,
    maxLeverage: number,
    oracleFeed: PublicKey,
    baseCurrency: PublicKey
  ): Promise<string> {
    const symbolBuffer = Array.from(Buffer.from(symbol.padEnd(16, "\0")));
    const marketPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), oracleFeed.toBuffer()],
      this.program.programId
    )[0];

    const tx = await this.program.methods
      .listMarket(symbolBuffer, decimals, maxLeverage)
      .accounts({
        globalState: this.pdas.globalStatePDA!,
        market: marketPDA,
        oracleFeed: oracleFeed,
        baseCurrency: baseCurrency,
        admin: this.accounts.admin.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([this.accounts.admin])
      .rpc();

    console.log("Market listing tx:", tx);
    return tx;
  }

  // Create a league
  async createLeague(
    creator: Keypair,
    startTs: number,
    endTs: number,
    entryAmount: number,
    markets: PublicKey[],
    metadataUri: string,
    maxParticipants: number,
    virtualOnDeposit: number,
    maxLeverage: number,
    nonce: number
  ): Promise<{ leaguePDA: PublicKey; tx: string }> {
    const leaguePDA = PublicKey.findProgramAddressSync(
      [
        Buffer.from("league"),
        creator.publicKey.toBuffer(),
        Buffer.from([nonce]),
      ],
      this.program.programId
    )[0];

    const rewardVaultPDA = await this.getRewardVaultATA(leaguePDA);

    const tx = await this.program.methods
      .createLeague(
        new BN(startTs),
        new BN(endTs),
        new BN(entryAmount),
        markets,
        metadataUri,
        maxParticipants,
        new BN(virtualOnDeposit),
        maxLeverage,
        nonce
      )
      .accounts({
        creator: creator.publicKey,
        league: leaguePDA,
        entryTokenMint: this.accounts.entryTokenMint,
        rewardVault: rewardVaultPDA,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: new PublicKey(
          "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        ),
      } as any)
      .signers([creator])
      .rpc();

    console.log("✅ League creation tx:", tx);
    return { leaguePDA, tx };
  }

  // Start a league
  async startLeague(leaguePDA: PublicKey, user: Keypair): Promise<string> {
    const tx = await this.program.methods
      .startLeague()
      .accounts({
        league: leaguePDA,
        user: user.publicKey,
      } as any)
      .signers([user])
      .rpc();

    console.log("✅ Start league tx:", tx);
    return tx;
  }

  // Join a league
  async joinLeague(
    user: Keypair,
    leaguePDA: PublicKey,
    participantPDA: PublicKey,
    amount: number
  ): Promise<string> {
    const rewardVaultAta = await this.getRewardVaultATA(leaguePDA);
    const userTokenAccount = await this.setupUserTokenAccount(user, amount);

    const tx = await this.program.methods
      .joinLeague(new BN(amount))
      .accounts({
        user: user.publicKey,
        league: leaguePDA,
        participant: participantPDA,
        rewardVault: rewardVaultAta,
        entryTokenMint: this.accounts.entryTokenMint,
        userEntryAta: userTokenAccount,
        vaultEntryAta: rewardVaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([user])
      .rpc();

    console.log("✅ Join league tx:", tx);
    return tx;
  }

  // Open a position
  async openPosition(
    user: Keypair,
    leaguePDA: PublicKey,
    marketPDA: PublicKey,
    participantPDA: PublicKey,
    positionPDA: PublicKey,
    direction: { long: {} } | { short: {} },
    size: number,
    leverage: number,
    seqNum: number
  ): Promise<string> {
    const tx = await this.program.methods
      .openPosition(direction, new BN(size), leverage, new BN(seqNum))
      .accounts({
        user: user.publicKey,
        league: leaguePDA,
        market: marketPDA,
        participant: participantPDA,
        position: positionPDA,
        oracleFeed: this.accounts.oracleFeed.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([user])
      .rpc();

    console.log("✅ Open position tx:", tx);
    return tx;
  }

  // Increase a position size
  async increasePositionSize(
    user: Keypair,
    leaguePDA: PublicKey,
    marketPDA: PublicKey,
    participantPDA: PublicKey,
    positionPDA: PublicKey,
    size: number,
  ): Promise<string> {
    const tx = await this.program.methods
      .increasePositionSize(new BN(size))
      .accounts({
        user: user.publicKey,
        league: leaguePDA,
        market: marketPDA,
        participant: participantPDA,
        position: positionPDA,
        oracleFeed: this.accounts.oracleFeed.publicKey,
      } as any)
      .signers([user])
      .rpc();

    console.log("✅ Update position tx:", tx);
    return tx;
  }

  // Decrease a position size
  async decreasePositionSize(
    user: Keypair,
    leaguePDA: PublicKey,
    participantPDA: PublicKey,
    positionPDA: PublicKey,
    sizeToClose: number
  ): Promise<string> {
    const tx = await this.program.methods
      .decreasePositionSize(new BN(sizeToClose))
      .accounts({
        user: user.publicKey,
        league: leaguePDA,
        participant: participantPDA,
        position: positionPDA,
        market: this.pdas.marketPDA!,
        oracleFeed: this.accounts.oracleFeed.publicKey,
      } as any)
      .signers([user])
      .rpc();

    console.log("✅ Close position tx:", tx);
    return tx;
  }

  // Helper methods
  private async getRewardVaultATA(leaguePDA: PublicKey): Promise<PublicKey> {
    return await getAssociatedTokenAddress(
      this.accounts.entryTokenMint,
      leaguePDA,
      true // allowOwnerOffCurve
    );
  }

  private async setupUserTokenAccount(
    user: Keypair,
    amount: number
  ): Promise<PublicKey> {
    const provider = getProvider();

    const userTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      this.accounts.entryTokenMint,
      user.publicKey
    );
    const userTokenAccount = userTokenAccountInfo.address;

    await mintTo(
      provider.connection,
      this.accounts.admin,
      this.accounts.entryTokenMint,
      userTokenAccount,
      this.accounts.admin,
      amount
    );

    return userTokenAccount;
  }
}

// Utility functions for test assertions
export function expectGlobalState(
  globalState: any,
  expected: {
    admin: PublicKey;
    feeBps: number;
    treasury: PublicKey;
    permissionProgram: PublicKey;
  }
): void {
  expect(globalState.admin.toString()).to.equal(expected.admin.toString());
  expect(globalState.feeBps).to.equal(expected.feeBps);
  expect(globalState.treasury.toString()).to.equal(
    expected.treasury.toString()
  );
  expect(globalState.permissionProgram.toString()).to.equal(
    expected.permissionProgram.toString()
  );
}

export function expectMarket(
  market: any,
  expected: {
    symbol: string;
    decimals: number;
    oracleFeed: PublicKey;
    baseCurrency: PublicKey;
    listedBy: PublicKey;
    isActive: boolean;
    maxLeverage: number;
  }
): void {
  expect(Array.from(market.symbol)).to.deep.equal(
    Array.from(Buffer.from(expected.symbol.padEnd(16, "\0")))
  );
  expect(market.decimals).to.equal(expected.decimals);
  expect(market.oracleFeed.toString()).to.equal(expected.oracleFeed.toString());
  expect(market.baseCurrency.toString()).to.equal(
    expected.baseCurrency.toString()
  );
  expect(market.listedBy.toString()).to.equal(expected.listedBy.toString());
  expect(market.isActive).to.equal(expected.isActive);
  expect(market.maxLeverage).to.equal(expected.maxLeverage);
}

export function expectLeague(
  league: any,
  expected: {
    creator: PublicKey;
    markets: PublicKey[];
    startTs: number;
    endTs: number;
    entryTokenMint: PublicKey;
    entryAmount: number;
    rewardVault: PublicKey;
    metadataUri: string;
    status: any;
    maxParticipants: number;
    virtualOnDeposit: number;
    maxLeverage: number;
  }
): void {
  expect(league.creator.toString()).to.equal(expected.creator.toString());
  expect(league.markets.length).to.equal(expected.markets.length);
  expect(league.markets[0].toString()).to.equal(expected.markets[0].toString());
  expect(league.startTs.toNumber()).to.equal(expected.startTs);
  expect(league.endTs.toNumber()).to.equal(expected.endTs);
  expect(league.entryTokenMint.toString()).to.equal(
    expected.entryTokenMint.toString()
  );
  expect(league.entryAmount.toString()).to.equal(
    expected.entryAmount.toString()
  );
  expect(league.rewardVault.toString()).to.equal(
    expected.rewardVault.toString()
  );
  expect(league.metadataUri).to.equal(expected.metadataUri);
  expect(league.status).to.deep.equal(expected.status);
  expect(league.maxParticipants).to.equal(expected.maxParticipants);
  expect(league.virtualOnDeposit.toString()).to.equal(
    expected.virtualOnDeposit.toString()
  );
  expect(league.maxLeverage).to.equal(expected.maxLeverage);
}

export function expectPosition(
  position: any,
  expected: {
    league: PublicKey;
    user: PublicKey;
    market: PublicKey;
    direction: any;
    size: number;
    leverage: number;
    entryPrice: number;
    openedAt: number;
    closedAt: number;
  }
): void {
  expect(position.league.toString()).to.equal(expected.league.toString());
  expect(position.user.toString()).to.equal(expected.user.toString());
  expect(position.market.toString()).to.equal(expected.market.toString());
  expect(position.direction).to.deep.equal(expected.direction);
  expect(position.size.toString()).to.equal(expected.size.toString());
  expect(position.leverage).to.equal(expected.leverage);
  expect(position.entryPrice.toString()).to.equal(
    expected.entryPrice.toString()
  );
  expect(position.openedAt.toNumber()).to.be.greaterThan(expected.openedAt);
  expect(position.closedAt.toNumber()).to.equal(expected.closedAt);
}
