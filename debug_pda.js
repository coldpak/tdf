const { PublicKey } = require("@solana/web3.js");

// Oracle program ID from Anchor.toml
const oracleProgramId = new PublicKey("6WPoE3jetRFmcfBnrmwukJGcHjwDkkSydHb3fcGp9a8n");

// Calculate the price feed PDA
const [priceFeedPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("price_feed")],
  oracleProgramId
);

console.log("Oracle Program ID:", oracleProgramId.toString());
console.log("Calculated Price Feed PDA:", priceFeedPDA.toString());
console.log("Expected PDA from error:", "6Ekw7dJjb8x7ZSPquo5z1wU4M4vMnMitT8a6h8xcS2AR");
console.log("Actual PDA from error:", "66gsDL8FmBwJVXVtcbQbAjjgTADhqcUkJSjoTtdB1EFp");
