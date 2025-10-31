<p align="center">
<img width="1329" height="600" alt="image" src="https://github.com/user-attachments/assets/ea932ed5-7446-4436-b552-688a9c24249b" />
</p>

<h1 align="center">⚡ TradeDotFun</h1>
<h3 align="center">The Cypherpunk Trading League on Solana</h3>

<p align="center">
  <i>Official submission for the <b>2025 Colosseum Cypherpunk Hackathon</b></i><br/>
  <i>Exploring privacy, coordination, and profit on Solana</i>
</p>

<p align="center">
  <a href="#features"><img src="https://img.shields.io/badge/Features-Ephemeral%20Rollups%20%7C%20MagicAction-blue"/></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/Stack-Solana%20%7C%20Anchor%20%7C%20ReactNative-green"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg"/></a>
</p>

---

## 🧠 Overview

TradeDotFun is a **fully on-chain trading league** built on **Solana**, designed to make trading **social, permissionless, and cypherpunk**.

It merges **RWA assets (AAPL, GOLD)** with **crypto markets**, rewarding **bold moves, hidden insights, and perfect timing**.

Built as part of the **Colosseum 2025 Cypherpunk Hackathon**,  
TradeDotFun explores what it means to trade in a world where **privacy is alpha** and **information is money**.

> 💡 **Real-time, real gains** — where the cypherpunk ethos meets Solana's performance.

The system integrates **MagicBlock's Ephemeral Rollups (ER) and MagicAction** for real-time state updates and privacy-preserving data control, turning on-chain trading into a living, evolving game.

---

## 🧩 Core Idea

### 🎮 Gamified Perp Trading

TradeDotFun transforms the hardcore world of trading into a social game of prediction and coordination.

- **Compete** in leagues with entry fees and fixed durations
- **Open and close** positions based on live oracles
- **Watch** your rank change in real time
- **Monetize** visibility through paid reveals for spectators and KOLs

> It's not just about making the right trade  
> It's about playing the market as performance art.

### 💰 Monetization & Community

- Trading **KOLs** can host private leagues for their followers
- **Revenue share** from entry fees, reveal payments, or sponsorships
- Leagues can become **self-contained micro economies** powered by participation and curiosity

> **Cypherpunk-style monetization:**  
> Not by ads or tokens, but through the value of hidden information.

### 🌍 RWA + Crypto Perp Trading

We're extending perps beyond crypto.  
Trade synthetic perpetuals for **RWA assets** such as **GOLD, AAPL, or TESLA**, powered by our custom Oracle program.

This bridges traditional markets and DeFi into a single game layer, a cypherpunk fusion of Web2 and Web3 value systems.

> Simulate Wall Street's tickers inside Solana's runtime.  
> Trade the world, stay on-chain.

---

## ⚙️ Technical Features

### 1. Hierarchical Optimized Updates
**Powered by MagicAction**

Real-time for players. Deliberate for the system.

- Delegated `participant` and `position` update reactively in ER utilizing real-time oracle
- On commit, we invoke **MagicAction** to cascade updates to other programs (e.g., `league` leaderboards, public stats), keeping hot paths fast and heavy aggregations off the critical path

> Separate the **"live state"** from the **"final state"** and sync them efficiently.

### 2. Private ER + Pay-to-Reveal
**Powered by Private ER**

- Hide position internals in the private ER; only publish allowed fields (PnL, aggregates) via commit-time MagicAction
- Users can **pay to reveal** a position or subscribe to a community for access
- This creates a viable path to monetize strategies while preserving composability

> **Curiosity itself becomes monetizable.**  
> Alpha turns into a micro-economy.

### 3. From Simulation to Execution

TradeDotFun can seamlessly connect to **Solana DEXs** such as Jupiter, Drift, or Meteora, allowing simulated trades to evolve into real market executions.

This makes TradeDotFun more than a paper-trading game.  
It's an **on-chain liquidity sandbox**, ready to plug into Solana's DeFi primitives.

Builders can extend the same commit flow to execute, hedge, or mirror live positions directly within the Solana ecosystem.

> A pathway from **play to profit** — powered by Solana.

---

## 🏗️ Architecture

<img width="865" height="628" alt="image" src="https://github.com/user-attachments/assets/981c200e-7f97-47f9-a876-f71dbf0d2e44" />

---

## 🚀 Getting Started

### 📋 Prerequisites

- **Rust** + Cargo
- **Solana CLI**
- **Node.js** + Yarn
- **Anchor CLI**

### 🔧 Installation

```bash
# Install dependencies
yarn install

# Build programs
anchor build
```

### 📱 Mobile App (Expo)

The repository includes a React Native app under `app/` built with Expo. It provides a minimal UI to connect a wallet, view account state, and interact with the on-chain programs.

```bash
# From the repo root
cd app

# Install app dependencies (uses npm)
npm install

# Start the Expo dev server
npm run dev

# Platform targets
npm run ios     # run on iOS simulator (Xcode required)
npm run android # run on Android emulator/device
npm run web     # run in the browser

# Quality
npm run lint
npm run fmt
```

- Uses `@solana-mobile/mobile-wallet-adapter` for wallet connections on mobile
- Includes cluster switching and basic account/airdrop screens
- See additional docs in `app/README.md`

### 🧪 Testing

```bash
# Run tests
yarn test
```

### 📝 Notes

- IDLs are generated under `target/idl/`
- Type bindings under `target/types/` (e.g., `tdf.ts`, `oracle.ts`)
- Example local ledgers are included under `test-ledger/` and `test-ledger-magicblock/` for faster iteration

---

## 🚧 Development Status

### ✅ Completed

- [x] Fully on-chain trading system core on Solana (see `programs/tdf`)
- [x] Simple oracle price program implemented (see `programs/oracle`)

### 🚧 In Progress

- [ ] ER lifecycle for `participant`/`position`: delegate → commit → undelegate
- [ ] Leaderboard updates via MagicAction
- [ ] Private ER for hidden positions + "pay to reveal"
- [ ] Minimal frontend
- [ ] Connect SDKs for real position (e.g., DriftSDK)

---

## 📄 License

**MIT**

---

<p align="center">
  <i>Built with ⚡ by the TradeDotFun team</i>
</p>
