#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
  // Individual test files
  GLOBAL_STATE: 'tests/global-state.test.ts',
  MARKET: 'tests/market.test.ts',
  LEAGUE: 'tests/league.test.ts',
  POSITION: 'tests/position.test.ts',
  INTEGRATION: 'tests/integration.test.ts',
  
  // Test patterns
  ALL_TESTS: 'tests/**/*.test.ts',
  UNIT_TESTS: 'tests/{global-state,market,league,position}.test.ts',
  
  // Mocha options
  MOCHA_OPTIONS: [
    '--timeout', '60000',
    '--bail', // Stop on first failure
    '--reporter', 'spec',
    '--require', 'ts-node/register'
  ]
};

// Available test commands
const COMMANDS = {
  'all': () => runTests([TEST_CONFIG.ALL_TESTS]),
  'unit': () => runTests([TEST_CONFIG.UNIT_TESTS]),
  'integration': () => runTests([TEST_CONFIG.INTEGRATION]),
  'global-state': () => runTests([TEST_CONFIG.GLOBAL_STATE]),
  'market': () => runTests([TEST_CONFIG.MARKET]),
  'league': () => runTests([TEST_CONFIG.LEAGUE]),
  'position': () => runTests([TEST_CONFIG.POSITION]),
  'help': () => showHelp()
};

function runTests(testFiles) {
  console.log('🧪 Running TDF Tests...\n');
  
  const args = [...TEST_CONFIG.MOCHA_OPTIONS, ...testFiles];
  
  const mocha = spawn('npx', ['mocha', ...args], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  mocha.on('close', (code) => {
    if (code === 0) {
      console.log('\n✅ All tests passed!');
    } else {
      console.log('\n❌ Some tests failed!');
      process.exit(code);
    }
  });

  mocha.on('error', (error) => {
    console.error('❌ Error running tests:', error);
    process.exit(1);
  });
}

function showHelp() {
  console.log(`
🧪 TDF Test Runner

Usage: node tests/test-runner.js <command>

Available commands:
  all           Run all tests
  unit          Run unit tests (global-state, market, league, position)
  integration   Run integration tests only
  global-state  Run global state tests only
  market        Run market tests only
  league        Run league tests only
  position      Run position tests only
  help          Show this help message

Examples:
  node tests/test-runner.js all
  node tests/test-runner.js unit
  node tests/test-runner.js position
  node tests/test-runner.js integration

Test Structure:
  📁 tests/
  ├── setup.ts              # Common test setup and configuration
  ├── helpers.ts            # Test helper functions
  ├── global-state.test.ts  # Global state initialization tests
  ├── market.test.ts        # Market listing tests
  ├── league.test.ts        # League creation and management tests
  ├── position.test.ts      # Position trading tests
  ├── integration.test.ts   # End-to-end integration tests
  └── test-runner.js       # This test runner script
`);
}

// Main execution
const command = process.argv[2] || 'help';

if (COMMANDS[command]) {
  COMMANDS[command]();
} else {
  console.log(`❌ Unknown command: ${command}`);
  showHelp();
  process.exit(1);
}
