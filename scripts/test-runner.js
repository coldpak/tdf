#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test configuration
const testConfig = {
  basic: {
    description: "Basic functionality tests",
    command: "yarn run ts-mocha -p ./tsconfig.json -t 1000000 \"tests/tdf.ts\"",
    timeout: 300000 // 5 minutes
  },
  edgeCases: {
    description: "Edge cases and boundary tests",
    command: "yarn run ts-mocha -p ./tsconfig.json -t 1000000 \"tests/tdf-edge-cases.ts\"",
    timeout: 600000 // 10 minutes
  },
  performance: {
    description: "Performance and stress tests",
    command: "yarn run ts-mocha -p ./tsconfig.json -t 1000000 \"tests/tdf-performance.ts\"",
    timeout: 900000 // 15 minutes
  },
  all: {
    description: "All tests",
    command: "yarn run ts-mocha -p ./tsconfig.json -t 1000000 \"tests/**/*.ts\"",
    timeout: 1200000 // 20 minutes
  }
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function runTest(testName, config) {
  log(`\n${colors.cyan}🚀 Running ${testName} tests...${colors.reset}`);
  log(`${colors.yellow}Description: ${config.description}${colors.reset}`);
  log(`${colors.blue}Command: ${config.command}${colors.reset}`);
  log(`${colors.magenta}Timeout: ${config.timeout / 1000}s${colors.reset}\n`);

  const startTime = Date.now();
  
  try {
    execSync(config.command, { 
      stdio: 'inherit', 
      timeout: config.timeout,
      cwd: process.cwd()
    });
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    log(`\n${colors.green}✅ ${testName} tests completed successfully in ${duration.toFixed(2)}s${colors.reset}`);
    return true;
  } catch (error) {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    log(`\n${colors.red}❌ ${testName} tests failed after ${duration.toFixed(2)}s${colors.reset}`);
    if (error.signal === 'SIGTERM') {
      log(`${colors.red}Test timed out after ${config.timeout / 1000}s${colors.reset}`);
    }
    return false;
  }
}

function checkPrerequisites() {
  log(`${colors.cyan}🔍 Checking prerequisites...${colors.reset}`);
  
  // Check if we're in the right directory
  if (!fs.existsSync('Anchor.toml')) {
    log(`${colors.red}❌ Anchor.toml not found. Please run this script from the project root.${colors.reset}`);
    process.exit(1);
  }
  
  // Check if tests directory exists
  if (!fs.existsSync('tests')) {
    log(`${colors.red}❌ Tests directory not found.${colors.reset}`);
    process.exit(1);
  }
  
  // Check if test files exist
  const testFiles = [
    'tests/tdf.ts',
    'tests/tdf-edge-cases.ts',
    'tests/tdf-performance.ts'
  ];
  
  for (const file of testFiles) {
    if (!fs.existsSync(file)) {
      log(`${colors.yellow}⚠️  Test file ${file} not found.${colors.reset}`);
    }
  }
  
  log(`${colors.green}✅ Prerequisites check completed${colors.reset}`);
}

function showHelp() {
  log(`${colors.bright}📋 TDF Test Runner${colors.reset}\n`);
  log(`${colors.yellow}Usage:${colors.reset}`);
  log(`  node scripts/test-runner.js [test-type]\n`);
  log(`${colors.yellow}Available test types:${colors.reset}`);
  log(`  ${colors.green}basic${colors.reset}       - Basic functionality tests`);
  log(`  ${colors.green}edge-cases${colors.reset}  - Edge cases and boundary tests`);
  log(`  ${colors.green}performance${colors.reset} - Performance and stress tests`);
  log(`  ${colors.green}all${colors.reset}         - Run all tests`);
  log(`  ${colors.green}help${colors.reset}        - Show this help message\n`);
  log(`${colors.yellow}Examples:${colors.reset}`);
  log(`  node scripts/test-runner.js basic`);
  log(`  node scripts/test-runner.js all`);
  log(`  node scripts/test-runner.js help\n`);
}

function main() {
  const args = process.argv.slice(2);
  const testType = args[0] || 'help';
  
  if (testType === 'help') {
    showHelp();
    return;
  }
  
  if (!testConfig[testType]) {
    log(`${colors.red}❌ Unknown test type: ${testType}${colors.reset}`);
    showHelp();
    process.exit(1);
  }
  
  checkPrerequisites();
  
  log(`${colors.bright}🧪 TDF Test Suite${colors.reset}`);
  log(`${colors.cyan}================================${colors.reset}\n`);
  
  const success = runTest(testType, testConfig[testType]);
  
  if (success) {
    log(`\n${colors.green}🎉 All tests passed!${colors.reset}`);
    process.exit(0);
  } else {
    log(`\n${colors.red}💥 Some tests failed!${colors.reset}`);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  log(`\n${colors.yellow}⚠️  Test execution interrupted by user${colors.reset}`);
  process.exit(1);
});

process.on('SIGTERM', () => {
  log(`\n${colors.yellow}⚠️  Test execution terminated${colors.reset}`);
  process.exit(1);
});

main();
