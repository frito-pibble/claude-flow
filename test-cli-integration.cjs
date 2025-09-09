#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');

console.log('🧪 Testing Claude Code CLI Integration\n');

// Test 1: Check Claude CLI is available
console.log('📋 Test 1: Claude CLI Availability');
function testCLIAvailable() {
  return new Promise((resolve, reject) => {
    const process = spawn('which', ['claude']);
    let output = '';
    
    process.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Claude CLI found at:', output.trim());
        resolve(true);
      } else {
        console.log('❌ Claude CLI not found');
        resolve(false);
      }
    });
    
    process.on('error', (err) => {
      console.log('❌ Error checking CLI:', err.message);
      resolve(false);
    });
  });
}

// Test 2: Basic CLI functionality
console.log('\n📋 Test 2: Basic CLI Message Test');
function testBasicCLI() {
  return new Promise((resolve, reject) => {
    const process = spawn('claude', ['-p', '--output-format', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    // Send test message
    process.stdin.write('Respond with exactly: "CLI_INTEGRATION_TEST_SUCCESS"');
    process.stdin.end();
    
    process.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    process.on('close', (code) => {
      try {
        if (code === 0 && output.trim()) {
          const response = JSON.parse(output);
          if (response.result && response.result.includes('CLI_INTEGRATION_TEST_SUCCESS')) {
            console.log('✅ CLI basic functionality works');
            console.log('📊 Response time:', response.duration_ms, 'ms');
            console.log('💰 Cost:', response.total_cost_usd ? '$' + response.total_cost_usd.toFixed(4) : '$0 (Pro account)');
            resolve(true);
          } else {
            console.log('⚠️  CLI responded but incorrect content:', response.result);
            resolve(false);
          }
        } else {
          console.log('❌ CLI failed with code:', code);
          console.log('❌ Error output:', errorOutput);
          resolve(false);
        }
      } catch (error) {
        console.log('❌ Failed to parse CLI response:', error.message);
        console.log('Raw output:', output);
        resolve(false);
      }
    });
    
    process.on('error', (err) => {
      console.log('❌ CLI process error:', err.message);
      resolve(false);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      process.kill();
      console.log('❌ CLI test timed out');
      resolve(false);
    }, 30000);
  });
}

// Test 3: Streaming functionality
console.log('\n📋 Test 3: CLI Streaming Test');
function testStreamingCLI() {
  return new Promise((resolve, reject) => {
    const process = spawn('claude', ['-p', '--output-format', 'stream-json'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let chunks = 0;
    let errorOutput = '';
    
    // Send test message
    process.stdin.write('Count from 1 to 3, one number per line');
    process.stdin.end();
    
    process.stdout.on('data', (data) => {
      chunks++;
      // Each chunk should be a separate JSON object
    });
    
    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0 && chunks > 1) {
        console.log('✅ CLI streaming works');
        console.log('📊 Received', chunks, 'streaming chunks');
        resolve(true);
      } else {
        console.log('❌ CLI streaming failed');
        console.log('❌ Error output:', errorOutput);
        resolve(false);
      }
    });
    
    process.on('error', (err) => {
      console.log('❌ CLI streaming error:', err.message);
      resolve(false);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      process.kill();
      console.log('❌ CLI streaming test timed out');
      resolve(false);
    }, 30000);
  });
}

// Test 4: Performance benchmark
console.log('\n📋 Test 4: Performance Benchmark');
async function performanceBenchmark() {
  const iterations = 3;
  const times = [];
  
  console.log(`Running ${iterations} CLI requests to measure performance...`);
  
  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();
    
    const success = await new Promise((resolve) => {
      const process = spawn('claude', ['-p', '--output-format', 'json'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      
      process.stdin.write(`Test request ${i + 1}`);
      process.stdin.end();
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.on('close', (code) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        times.push(duration);
        console.log(`  Request ${i + 1}: ${duration}ms`);
        resolve(code === 0);
      });
      
      process.on('error', () => resolve(false));
      
      setTimeout(() => {
        process.kill();
        resolve(false);
      }, 30000);
    });
    
    if (!success) {
      console.log('❌ Performance test failed');
      return false;
    }
  }
  
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  console.log('✅ Performance benchmark completed');
  console.log(`📊 Average response time: ${avgTime.toFixed(0)}ms`);
  console.log(`📊 Min response time: ${minTime}ms`);
  console.log(`📊 Max response time: ${maxTime}ms`);
  
  return true;
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Claude Code CLI Integration Tests\n');
  
  const results = {
    cliAvailable: false,
    basicFunctionality: false,
    streaming: false,
    performance: false
  };
  
  // Test CLI availability
  results.cliAvailable = await testCLIAvailable();
  
  if (results.cliAvailable) {
    // Test basic functionality
    results.basicFunctionality = await testBasicCLI();
    
    if (results.basicFunctionality) {
      // Test streaming
      results.streaming = await testStreamingCLI();
      
      // Performance benchmark
      results.performance = await performanceBenchmark();
    }
  }
  
  // Summary
  console.log('\n📊 Test Results Summary:');
  console.log('='.repeat(40));
  console.log(`CLI Available:        ${results.cliAvailable ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Basic Functionality:  ${results.basicFunctionality ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Streaming Support:    ${results.streaming ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Performance Test:     ${results.performance ? '✅ PASS' : '❌ FAIL'}`);
  
  const passCount = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;
  
  console.log('\n🎯 Overall Result:');
  if (passCount === totalTests) {
    console.log('🎉 ALL TESTS PASSED! Claude Code CLI integration is working perfectly.');
  } else if (passCount > 0) {
    console.log(`⚠️  PARTIAL SUCCESS: ${passCount}/${totalTests} tests passed.`);
  } else {
    console.log('❌ ALL TESTS FAILED. CLI integration needs attention.');
  }
  
  console.log('\n💡 Next Steps:');
  if (results.cliAvailable && results.basicFunctionality) {
    console.log('✅ Your CLI integration is functional!');
    console.log('🔧 To use it in claude-flow:');
    console.log('   1. Fix TypeScript compilation issues');
    console.log('   2. Run: npx claude-flow doctor');
    console.log('   3. Run: npx claude-flow setup-cli');
    console.log('   4. Configure your provider to use Claude Code CLI');
  } else if (results.cliAvailable) {
    console.log('🔧 CLI is installed but has issues. Check authentication:');
    console.log('   1. Run: claude auth');
    console.log('   2. Ensure you have a Claude Pro account');
    console.log('   3. Check your internet connection');
  } else {
    console.log('🔧 Install Claude Code CLI first:');
    console.log('   1. Visit: https://claude.ai/code');
    console.log('   2. Download and install Claude Code CLI');
    console.log('   3. Run: claude auth');
  }
}

// Run tests
runAllTests().catch(console.error);