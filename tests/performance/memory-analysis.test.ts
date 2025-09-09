/**
 * Memory Usage Analysis and Concurrent Request Testing
 * 
 * These tests focus on memory usage patterns, leak detection, and concurrent
 * request handling for the CLI integration system.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { performance } from 'perf_hooks';
import { CLIDetector, createCLIDetector } from '../../src/utils/cli-detection.js';
import { ClaudeCodeCLIClient } from '../../src/api/claude-code-cli-client.js';
import { CLIPerformanceMonitor, CLIProcessPool } from '../../src/utils/cli-performance.js';
import { ProviderManager } from '../../src/providers/provider-manager.js';
import { ConfigManager } from '../../src/config/config-manager.js';

interface MemorySnapshot {
  timestamp: number;
  iteration: number;
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

interface MemoryAnalysis {
  initialSnapshot: MemorySnapshot;
  finalSnapshot: MemorySnapshot;
  peakSnapshot: MemorySnapshot;
  checkpoints: MemorySnapshot[];
  analysis: {
    totalGrowthMB: number;
    peakGrowthMB: number;
    averageGrowthRate: number;
    memoryLeakDetected: boolean;
    recommendation: string;
  };
}

interface ConcurrentTestResult {
  concurrency: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  throughput: number;
  memoryUsage: MemorySnapshot;
  errors: Array<{ type: string; count: number; message: string }>;
}

describe('Memory Analysis and Concurrent Testing', () => {
  let cliDetector: CLIDetector;
  let cliClient: ClaudeCodeCLIClient;
  let performanceMonitor: CLIPerformanceMonitor;
  let processPool: CLIProcessPool;
  let configManager: ConfigManager;
  
  let cliAvailable = false;
  let cliAuthenticated = false;

  beforeAll(async () => {
    // Initialize components
    cliDetector = createCLIDetector();
    performanceMonitor = new CLIPerformanceMonitor({ 
      enableMonitoring: true,
      enableDetailedMetrics: true,
      memoryMonitoring: true
    });
    
    processPool = new CLIProcessPool({ 
      poolSize: 8,
      enableHealthCheck: true,
      maxIdleTime: 10000
    });

    configManager = ConfigManager.getInstance();
    await configManager.loadConfig();

    // Check CLI availability
    try {
      cliAvailable = await cliDetector.isCLIInstalled();
      if (cliAvailable) {
        cliAuthenticated = await cliDetector.isCLIAuthenticated();
      }
    } catch (error) {
      console.log('CLI availability check failed:', error);
    }

    if (cliAvailable && cliAuthenticated) {
      cliClient = new ClaudeCodeCLIClient({
        timeout: 30000,
        maxConcurrentProcesses: 8,
        processPooling: true,
        enableStreaming: false // Disable streaming for memory analysis
      });
    }

    console.log('🧠 Memory Analysis Test Setup:');
    console.log(`   CLI Available: ${cliAvailable} (Authenticated: ${cliAuthenticated})`);
    console.log(`   Initial Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('   🗑️  Garbage collection available and executed');
    }
  });

  afterAll(async () => {
    if (performanceMonitor) {
      await performanceMonitor.shutdown();
    }
    if (processPool) {
      await processPool.shutdown();
    }

    // Final garbage collection
    if (global.gc) {
      global.gc();
    }
  });

  /**
   * Utility function to take a memory snapshot
   */
  function takeMemorySnapshot(iteration: number = 0): MemorySnapshot {
    const memory = process.memoryUsage();
    return {
      timestamp: performance.now(),
      iteration,
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers || 0
    };
  }

  /**
   * Utility function to format memory size
   */
  function formatMemory(bytes: number): string {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  }

  /**
   * Utility function to analyze memory snapshots
   */
  function analyzeMemoryUsage(snapshots: MemorySnapshot[]): MemoryAnalysis {
    const initialSnapshot = snapshots[0];
    const finalSnapshot = snapshots[snapshots.length - 1];
    let peakSnapshot = initialSnapshot;

    // Find peak memory usage
    for (const snapshot of snapshots) {
      if (snapshot.heapUsed > peakSnapshot.heapUsed) {
        peakSnapshot = snapshot;
      }
    }

    const totalGrowthBytes = finalSnapshot.heapUsed - initialSnapshot.heapUsed;
    const peakGrowthBytes = peakSnapshot.heapUsed - initialSnapshot.heapUsed;
    const totalGrowthMB = totalGrowthBytes / 1024 / 1024;
    const peakGrowthMB = peakGrowthBytes / 1024 / 1024;

    // Calculate average growth rate (MB per operation)
    const operationCount = snapshots.length - 1;
    const averageGrowthRate = totalGrowthMB / operationCount;

    // Detect potential memory leaks
    const midPoint = Math.floor(snapshots.length / 2);
    const firstHalfGrowth = snapshots[midPoint].heapUsed - initialSnapshot.heapUsed;
    const secondHalfGrowth = finalSnapshot.heapUsed - snapshots[midPoint].heapUsed;
    const memoryLeakDetected = secondHalfGrowth > firstHalfGrowth * 1.5;

    let recommendation = '';
    if (totalGrowthMB > 50) {
      recommendation = 'High memory usage detected. Consider optimizing data structures or increasing GC frequency.';
    } else if (memoryLeakDetected) {
      recommendation = 'Potential memory leak detected. Review object lifecycle management.';
    } else if (averageGrowthRate > 2) {
      recommendation = 'Memory growth rate is concerning. Monitor for potential leaks.';
    } else {
      recommendation = 'Memory usage appears normal and well-managed.';
    }

    return {
      initialSnapshot,
      finalSnapshot,
      peakSnapshot,
      checkpoints: snapshots,
      analysis: {
        totalGrowthMB,
        peakGrowthMB,
        averageGrowthRate,
        memoryLeakDetected,
        recommendation
      }
    };
  }

  describe('Memory Leak Detection', () => {
    test('should not leak memory during sustained CLI operations', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping memory leak test - CLI not available');
        return;
      }

      const operations = 50;
      const snapshots: MemorySnapshot[] = [];
      
      console.log(`🔍 Running memory leak detection test (${operations} operations)`);
      
      // Take initial snapshot
      if (global.gc) global.gc();
      snapshots.push(takeMemorySnapshot(0));

      // Perform operations with periodic snapshots
      for (let i = 0; i < operations; i++) {
        try {
          await cliClient.sendMessage({
            message: `Memory leak test ${i + 1} - respond with exactly "OK"`,
            model: 'claude-3-haiku-20240307',
            maxTokens: 10
          });

          // Take snapshot every 10 operations
          if (i % 10 === 9) {
            if (global.gc) global.gc();
            await new Promise(resolve => setTimeout(resolve, 100)); // Let GC settle
            snapshots.push(takeMemorySnapshot(i + 1));
          }

        } catch (error) {
          console.log(`Operation ${i + 1} failed:`, error.message);
        }

        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Final snapshot
      if (global.gc) global.gc();
      await new Promise(resolve => setTimeout(resolve, 200));
      snapshots.push(takeMemorySnapshot(operations));

      // Analyze memory usage
      const analysis = analyzeMemoryUsage(snapshots);

      console.log('🧠 Memory Analysis Results:');
      console.log(`   Initial Memory: ${formatMemory(analysis.initialSnapshot.heapUsed)}`);
      console.log(`   Final Memory: ${formatMemory(analysis.finalSnapshot.heapUsed)}`);
      console.log(`   Peak Memory: ${formatMemory(analysis.peakSnapshot.heapUsed)}`);
      console.log(`   Total Growth: ${formatMemory(analysis.analysis.totalGrowthMB * 1024 * 1024)}`);
      console.log(`   Average Growth Rate: ${analysis.analysis.averageGrowthRate.toFixed(3)}MB per operation`);
      console.log(`   Memory Leak Detected: ${analysis.analysis.memoryLeakDetected}`);
      console.log(`   Recommendation: ${analysis.analysis.recommendation}`);

      // Memory leak detection assertions
      expect(analysis.analysis.totalGrowthMB).toBeLessThan(100); // Less than 100MB total growth
      expect(analysis.analysis.averageGrowthRate).toBeLessThan(1); // Less than 1MB per operation
      expect(analysis.analysis.memoryLeakDetected).toBe(false); // No memory leak detected

      // Log checkpoint details for debugging
      console.log('📊 Memory Checkpoints:');
      analysis.checkpoints.forEach(checkpoint => {
        console.log(`   Iteration ${checkpoint.iteration}: ${formatMemory(checkpoint.heapUsed)}`);
      });
    }, 400000);

    test('should manage process pool memory efficiently', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping process pool memory test - CLI not available');
        return;
      }

      const poolOperations = 30;
      const snapshots: MemorySnapshot[] = [];
      
      console.log(`🏊 Running process pool memory test (${poolOperations} operations)`);

      // Initial snapshot
      if (global.gc) global.gc();
      snapshots.push(takeMemorySnapshot(0));

      // Acquire and release processes repeatedly
      for (let i = 0; i < poolOperations; i++) {
        try {
          const process = await processPool.acquireProcess();
          expect(process).toBeDefined();
          
          // Simulate some work
          await new Promise(resolve => setTimeout(resolve, 100));
          
          await processPool.releaseProcess(process);

          // Take snapshot every 10 operations
          if (i % 10 === 9) {
            if (global.gc) global.gc();
            await new Promise(resolve => setTimeout(resolve, 100));
            snapshots.push(takeMemorySnapshot(i + 1));
            
            const poolStats = await processPool.getStats();
            console.log(`   Pool Stats (${i + 1}): Active: ${poolStats.activeProcesses}, Idle: ${poolStats.idleProcesses}`);
          }

        } catch (error) {
          console.log(`Pool operation ${i + 1} failed:`, error.message);
        }
      }

      // Final snapshot and pool stats
      if (global.gc) global.gc();
      await new Promise(resolve => setTimeout(resolve, 200));
      snapshots.push(takeMemorySnapshot(poolOperations));

      const finalPoolStats = await processPool.getStats();
      console.log('🏊 Final Pool Stats:', finalPoolStats);

      // Analyze process pool memory usage
      const analysis = analyzeMemoryUsage(snapshots);

      console.log('🧠 Process Pool Memory Analysis:');
      console.log(`   Total Growth: ${formatMemory(analysis.analysis.totalGrowthMB * 1024 * 1024)}`);
      console.log(`   Memory Leak Detected: ${analysis.analysis.memoryLeakDetected}`);
      console.log(`   Pool is Healthy: ${finalPoolStats.totalProcesses > 0}`);

      // Process pool should not leak memory
      expect(analysis.analysis.totalGrowthMB).toBeLessThan(50); // Less than 50MB growth
      expect(analysis.analysis.memoryLeakDetected).toBe(false);
      expect(finalPoolStats.activeProcesses).toBe(0); // All processes should be released
    }, 200000);
  });

  describe('Concurrent Request Stress Testing', () => {
    test('should handle low concurrency gracefully', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping low concurrency test - CLI not available');
        return;
      }

      const concurrency = 3;
      const result = await runConcurrentTest(concurrency, 'Low concurrency test');
      
      console.log('🔄 Low Concurrency Results:', {
        concurrency: result.concurrency,
        successRate: `${((result.successfulRequests / result.totalRequests) * 100).toFixed(1)}%`,
        averageTime: `${result.averageResponseTime.toFixed(2)}ms`,
        throughput: `${result.throughput.toFixed(2)} req/sec`,
        memoryUsage: formatMemory(result.memoryUsage.heapUsed)
      });

      // Low concurrency should have high success rate
      expect(result.successfulRequests / result.totalRequests).toBeGreaterThan(0.8); // 80% success
      expect(result.averageResponseTime).toBeLessThan(15000); // 15s average
      expect(result.throughput).toBeGreaterThan(0.2); // At least 0.2 req/sec
    }, 120000);

    test('should handle medium concurrency with acceptable performance', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping medium concurrency test - CLI not available');
        return;
      }

      const concurrency = 6;
      const result = await runConcurrentTest(concurrency, 'Medium concurrency test');
      
      console.log('🔄 Medium Concurrency Results:', {
        concurrency: result.concurrency,
        successRate: `${((result.successfulRequests / result.totalRequests) * 100).toFixed(1)}%`,
        averageTime: `${result.averageResponseTime.toFixed(2)}ms`,
        p95Time: `${result.p95ResponseTime.toFixed(2)}ms`,
        throughput: `${result.throughput.toFixed(2)} req/sec`,
        memoryUsage: formatMemory(result.memoryUsage.heapUsed)
      });

      // Medium concurrency should still perform reasonably
      expect(result.successfulRequests / result.totalRequests).toBeGreaterThan(0.6); // 60% success
      expect(result.averageResponseTime).toBeLessThan(25000); // 25s average
      expect(result.throughput).toBeGreaterThan(0.1); // At least 0.1 req/sec
    }, 180000);

    test('should handle high concurrency and detect limits', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping high concurrency test - CLI not available');
        return;
      }

      const concurrency = 10;
      const result = await runConcurrentTest(concurrency, 'High concurrency test');
      
      console.log('🔄 High Concurrency Results:', {
        concurrency: result.concurrency,
        successRate: `${((result.successfulRequests / result.totalRequests) * 100).toFixed(1)}%`,
        averageTime: `${result.averageResponseTime.toFixed(2)}ms`,
        p95Time: `${result.p95ResponseTime.toFixed(2)}ms`,
        throughput: `${result.throughput.toFixed(2)} req/sec`,
        errors: result.errors.length,
        memoryUsage: formatMemory(result.memoryUsage.heapUsed)
      });

      console.log('❌ Error Breakdown:', result.errors);

      // High concurrency may have lower success rates but should not crash
      expect(result.successfulRequests).toBeGreaterThan(0); // At least some success
      expect(result.totalRequests).toBe(concurrency); // All requests attempted
      expect(result.memoryUsage.heapUsed).toBeLessThan(500 * 1024 * 1024); // Less than 500MB
    }, 300000);

    async function runConcurrentTest(concurrency: number, testName: string): Promise<ConcurrentTestResult> {
      const startTime = performance.now();
      const initialMemory = takeMemorySnapshot(0);
      
      const results: Array<{ success: boolean; time: number; error?: any }> = [];
      
      console.log(`⚡ Running ${testName} with concurrency ${concurrency}`);

      const promises = Array.from({ length: concurrency }, async (_, i) => {
        const requestStart = performance.now();
        
        try {
          await cliClient.sendMessage({
            message: `${testName} request ${i + 1} - respond with "OK"`,
            model: 'claude-3-haiku-20240307',
            maxTokens: 10
          });
          
          const requestTime = performance.now() - requestStart;
          results.push({ success: true, time: requestTime });
          
        } catch (error) {
          const requestTime = performance.now() - requestStart;
          results.push({ success: false, time: requestTime, error });
        }
      });

      await Promise.all(promises);

      const endTime = performance.now();
      const finalMemory = takeMemorySnapshot(concurrency);
      
      // Analyze results
      const successfulRequests = results.filter(r => r.success).length;
      const failedRequests = results.filter(r => !r.success).length;
      const responseTimes = results.map(r => r.time);
      const averageResponseTime = responseTimes.length > 0 ? 
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;
      
      const sortedTimes = responseTimes.sort((a, b) => a - b);
      const p95ResponseTime = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
      
      const totalTime = endTime - startTime;
      const throughput = (successfulRequests * 1000) / totalTime;

      // Categorize errors
      const errorCounts = new Map<string, { count: number; example: string }>();
      results.filter(r => !r.success).forEach(r => {
        const errorType = r.error?.constructor?.name || 'Unknown';
        const existing = errorCounts.get(errorType) || { count: 0, example: '' };
        existing.count++;
        if (!existing.example) {
          existing.example = r.error?.message || 'Unknown error';
        }
        errorCounts.set(errorType, existing);
      });

      const errors = Array.from(errorCounts.entries()).map(([type, data]) => ({
        type,
        count: data.count,
        message: data.example
      }));

      return {
        concurrency,
        totalRequests: concurrency,
        successfulRequests,
        failedRequests,
        averageResponseTime,
        p95ResponseTime,
        throughput,
        memoryUsage: finalMemory,
        errors
      };
    }
  });

  describe('Memory Optimization Analysis', () => {
    test('should analyze garbage collection patterns', async () => {
      if (!global.gc) {
        console.log('⚠️  Skipping GC analysis - garbage collection not available');
        return;
      }

      const iterations = 20;
      const gcSnapshots: MemorySnapshot[] = [];
      
      console.log(`🗑️  Running garbage collection analysis (${iterations} iterations)`);

      for (let i = 0; i < iterations; i++) {
        // Force garbage collection
        global.gc();
        const beforeSnapshot = takeMemorySnapshot(i * 2);
        
        // Perform operation that creates objects
        if (cliAvailable && cliAuthenticated) {
          try {
            await cliClient.sendMessage({
              message: `GC test ${i + 1}`,
              model: 'claude-3-haiku-20240307',
              maxTokens: 10
            });
          } catch (error) {
            // Ignore errors for GC analysis
          }
        } else {
          // Simulate memory usage without CLI
          const largeArray = new Array(10000).fill('x'.repeat(100));
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        const afterSnapshot = takeMemorySnapshot(i * 2 + 1);
        gcSnapshots.push(beforeSnapshot, afterSnapshot);

        if (i % 5 === 4) {
          console.log(`   Iteration ${i + 1}: Before GC: ${formatMemory(beforeSnapshot.heapUsed)}, After Op: ${formatMemory(afterSnapshot.heapUsed)}`);
        }
      }

      // Analyze GC effectiveness
      const gcEffectiveness = [];
      for (let i = 0; i < gcSnapshots.length - 1; i += 2) {
        const before = gcSnapshots[i];
        const after = gcSnapshots[i + 1];
        const growth = after.heapUsed - before.heapUsed;
        gcEffectiveness.push(growth);
      }

      const averageGrowth = gcEffectiveness.reduce((sum, growth) => sum + growth, 0) / gcEffectiveness.length;
      const maxGrowth = Math.max(...gcEffectiveness);
      const minGrowth = Math.min(...gcEffectiveness);

      console.log('🗑️  Garbage Collection Analysis:');
      console.log(`   Average Growth per Operation: ${formatMemory(averageGrowth)}`);
      console.log(`   Maximum Growth: ${formatMemory(maxGrowth)}`);
      console.log(`   Minimum Growth: ${formatMemory(minGrowth)}`);
      console.log(`   GC Effectiveness: ${averageGrowth < 1024 * 1024 ? 'Good' : 'Needs Attention'}`);

      // GC should be effective
      expect(averageGrowth).toBeLessThan(5 * 1024 * 1024); // Less than 5MB average growth
      expect(maxGrowth).toBeLessThan(20 * 1024 * 1024); // Less than 20MB max growth
    }, 300000);

    test('should provide memory optimization recommendations', async () => {
      const memoryAnalytics = await performanceMonitor.getMemoryAnalytics();
      
      console.log('🧠 Memory Analytics:', JSON.stringify(memoryAnalytics, null, 2));

      expect(memoryAnalytics).toHaveProperty('currentUsage');
      expect(memoryAnalytics).toHaveProperty('trends');
      expect(memoryAnalytics).toHaveProperty('recommendations');

      // Should provide meaningful recommendations
      expect(Array.isArray(memoryAnalytics.recommendations)).toBe(true);
      memoryAnalytics.recommendations.forEach(rec => {
        expect(rec).toHaveProperty('type');
        expect(rec).toHaveProperty('description');
        expect(rec).toHaveProperty('priority');
      });
    });
  });

  describe('Resource Cleanup Validation', () => {
    test('should properly clean up resources after operations', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping resource cleanup test - CLI not available');
        return;
      }

      const operations = 15;
      
      console.log(`🧹 Running resource cleanup validation (${operations} operations)`);

      // Get initial resource state
      const initialMemory = takeMemorySnapshot(0);
      const initialPoolStats = await processPool.getStats();
      const initialPerformanceStats = performanceMonitor.getPerformanceStats();

      console.log('🔢 Initial State:', {
        memory: formatMemory(initialMemory.heapUsed),
        poolProcesses: initialPoolStats.totalProcesses,
        totalOperations: initialPerformanceStats.totalProcesses
      });

      // Perform operations
      for (let i = 0; i < operations; i++) {
        try {
          await cliClient.sendMessage({
            message: `Cleanup test ${i + 1}`,
            model: 'claude-3-haiku-20240307',
            maxTokens: 10
          });
        } catch (error) {
          console.log(`Operation ${i + 1} failed:`, error.message);
        }

        // Intermittent cleanup
        if (i % 5 === 4 && global.gc) {
          global.gc();
        }
      }

      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Get final resource state
      const finalMemory = takeMemorySnapshot(operations);
      const finalPoolStats = await processPool.getStats();
      const finalPerformanceStats = performanceMonitor.getPerformanceStats();

      console.log('🔢 Final State:', {
        memory: formatMemory(finalMemory.heapUsed),
        memoryGrowth: formatMemory(finalMemory.heapUsed - initialMemory.heapUsed),
        poolProcesses: finalPoolStats.totalProcesses,
        activeProcesses: finalPoolStats.activeProcesses,
        totalOperations: finalPerformanceStats.totalProcesses
      });

      // Resource cleanup validation
      expect(finalPoolStats.activeProcesses).toBe(0); // No active processes after completion
      expect(finalMemory.heapUsed - initialMemory.heapUsed).toBeLessThan(30 * 1024 * 1024); // Less than 30MB growth
      expect(finalPerformanceStats.totalProcesses).toBeGreaterThan(initialPerformanceStats.totalProcesses); // Operations were tracked

      console.log('✅ Resource cleanup validation passed');
    }, 180000);
  });
});