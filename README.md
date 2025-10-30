# ⚡ TradeDotFun

The Cyberpunk Trading League on Solana

> Real time, real gains — in a game that blurs the line between DeFi, gaming, and culture.

## 🧠 Overview

TradeDotFun is a **fully on-chain trading league** built on **Solana**, designed to make trading social, gamified, and profitable.<br/>
We’re building a perp trading experience that blends RWA assets (like AAPL, GOLD) with crypto markets, under a structure that rewards bold moves, hidden insights, and perfect timing.

The system integrates **MagicBlock’s Ephemeral Rollups (ER) and MagicAction** for real-time state updates and privacy-preserving data control, turning on-chain trading into a living, evolving game.


## 🧩 Core Idea

### 🎮 Gamified Perp Trading

TradeDotFun transforms the hardcore world of trading into a social game of prediction and coordination.

- Compete in leagues with entry fees and fixed durations

- Open and close positions based on live oracles

- Watch your rank change in real time

- Spectators and KOLs can monetize visibility through paid reveals

>It’s not just about making the right trade<br/>
It’s about playing the market as performance art.

### 💰 Monetization & Community

- Trading KOLs can host private leagues for their followers

- Revenue share from entry fees, reveal payments, or sponsorships

- Leagues can become self-contained micro economies powered by participation and curiosity

This enables Cypherpunk-style monetization.<br/>
not by ads or tokens, but through the value of hidden information.

### 🌍 RWA + Crypto Perp Trading

We’re extending perps beyond crypto.<br/>
Trade synthetic perpetuals for RWA assets such as GOLD, AAPL, or TESLA, powered by our custom Oracle program.

This bridges traditional markets and DeFi into a single game layer, a cyberpunk fusion of Web2 and Web3 value systems.

>Simulate Wall Street’s tickers inside Solana’s runtime.<br/>
Trade the world, stay on-chain.


## ⚙️ Technical Features

### 1. Hierarchical Optimized Updates (powered by MagicAction)
Real-time for players. Deliberate for the system.
- Delegated `participant` and `position` update reactively in ER utilizing real-time oracle.
- On commit, we invoke MagicAction to cascade updates to other programs (e.g., `league` leaderboards, public stats), keeping hot paths fast and heavy aggregations off the critical path.
>Separate the “live state” from the “final state” and sync them efficiently.

### 2. Private ER + Pay-to-Reveal (powered by Private ER)
- Hide position internals in the private ER; only publish allowed fields (PnL, aggregates) via commit-time MagicAction.
- Users can pay to reveal a position or subscribe to a community for access. This creates a viable path to monetize strategies while preserving composability.

> Curiosity itself becomes monetizable.<br/>
Alpha turns into a micro-economy.

### 3. From Simulation to Execution

TradeDotFun can seamlessly connect to Solana DEXs such as Jupiter, Drift, or Meteora, allowing simulated trades to evolve into real market executions.

This makes TradeDotFun more than a paper-trading game.<br/>It’s an on-chain liquidity sandbox, ready to plug into Solana’s DeFi primitives.

Builders can extend the same commit flow to execute, hedge, or mirror live positions directly within the Solana ecosystem.

>A pathway from play to profit - powered by Solana.

---

## 🏗️ Architecture

(Diagram Placeholder)

---

## 🚧 Current Dev Status

- [x] Fully on-chain trading system core on Solana, heavy and messy (see `programs/tdf`).

- [x] Simple oracle price program implemented (see `programs/oracle`).

- [ ] ER lifecycle for `participant`/`position`: delegate → commit → undelegate (in progress).

- [ ] Leaderboard updates via MagicAction.

- [ ] Private ER for hidden positions + “pay to reveal”.

- [ ] Minimal frontend

- [ ] Connect SDKs for real position (e.g., DriftSDK)


### Local Development Quickstart
Prereqs
- Rust + Cargo, Solana CLI, Node.js + Yarn, Anchor CLI

Install deps
```bash
yarn install
```

Build programs
```bash
anchor build
```

Run tests
```bash
yarn test
```

Notes
- IDLs are generated under `target/idl/`.
- Type bindings under `target/types/` (e.g., `tdf.ts`, `oracle.ts`).
- Example local ledgers are included under `test-ledger/` and `test-ledger-magicblock/` for faster iteration.

### License
MIT


