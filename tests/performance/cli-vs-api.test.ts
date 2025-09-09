/**
 * Performance Benchmark Tests: CLI vs API Comparison
 * 
 * These tests measure and compare performance between Claude Code CLI integration
 * and direct API usage to validate the efficiency of the CLI approach.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { performance } from 'perf_hooks';
import { CLIDetector, createCLIDetector } from '../../src/utils/cli-detection.js';
import { ClaudeCodeCLIClient } from '../../src/api/claude-code-cli-client.js';
import { ClaudeAPIClient } from '../../src/api/claude-client.js';
import { CLIPerformanceMonitor, CLIProcessPool } from '../../src/utils/cli-performance.js';
import { ProviderManager } from '../../src/providers/provider-manager.js';
import { ConfigManager } from '../../src/config/config-manager.js';

interface PerformanceMetrics {
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  p95Time: number;
  p99Time: number;
  successRate: number;
  throughput: number; // operations per second
  memoryUsage?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  errorCount: number;
  timeoutCount: number;
}

interface ComparisonResult {
  cli: PerformanceMetrics;
  api: PerformanceMetrics;
  comparison: {
    timeRatio: number; // CLI time / API time
    throughputRatio: number; // CLI throughput / API throughput
    memoryRatio?: number; // CLI memory / API memory
    winner: 'cli' | 'api' | 'tie';
    recommendation: string;
  };
}

describe('CLI vs API Performance Benchmarks', () => {
  let cliDetector: CLIDetector;
  let cliClient: ClaudeCodeCLIClient;
  let apiClient: ClaudeAPIClient;
  let performanceMonitor: CLIPerformanceMonitor;
  let processPool: CLIProcessPool;
  let providerManager: ProviderManager;
  
  let cliAvailable = false;
  let cliAuthenticated = false;
  let apiKeyAvailable = false;

  beforeAll(async () => {
    // Initialize components
    cliDetector = createCLIDetector();
    performanceMonitor = new CLIPerformanceMonitor({ 
      enableMonitoring: true,
      enableDetailedMetrics: true 
    });
    processPool = new CLIProcessPool({ poolSize: 5, enableHealthCheck: true });
    
    const configManager = ConfigManager.getInstance();
    await configManager.loadConfig();
    providerManager = new ProviderManager(configManager);

    // Check CLI availability
    try {
      cliAvailable = await cliDetector.isCLIInstalled();
      if (cliAvailable) {
        cliAuthenticated = await cliDetector.isCLIAuthenticated();
      }
    } catch (error) {
      console.log('CLI availability check failed:', error);
    }

    // Check API key availability
    const config = configManager.getConfig();
    apiKeyAvailable = !!(config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY);

    // Initialize clients
    if (cliAvailable && cliAuthenticated) {
      cliClient = new ClaudeCodeCLIClient({
        timeout: 30000,
        maxConcurrentProcesses: 5,
        processPooling: true,
        enableStreaming: true
      });
    }

    if (apiKeyAvailable) {
      apiClient = new ClaudeAPIClient({
        apiKey: config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY!,
        timeout: 30000
      });
    }

    console.log('🔧 Performance Test Setup:');
    console.log(`   CLI Available: ${cliAvailable} (Authenticated: ${cliAuthenticated})`);
    console.log(`   API Available: ${apiKeyAvailable}`);
    
    if (!cliAvailable && !apiKeyAvailable) {
      console.log('⚠️  No clients available for performance comparison');
    } else if (!cliAvailable || !cliAuthenticated) {
      console.log('⚠️  CLI not available - will test API performance only');
    } else if (!apiKeyAvailable) {
      console.log('⚠️  API not available - will test CLI performance only');
    } else {
      console.log('✅ Both CLI and API available - running full comparison');
    }
  });

  afterAll(async () => {
    if (performanceMonitor) {
      await performanceMonitor.shutdown();
    }
    if (processPool) {
      await processPool.shutdown();
    }
  });

  /**
   * Utility function to calculate performance metrics from execution times
   */
  function calculateMetrics(times: number[], errors: number, timeouts: number): PerformanceMetrics {
    const sortedTimes = times.sort((a, b) => a - b);
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    
    return {
      totalTime,
      averageTime: totalTime / times.length,
      minTime: sortedTimes[0] || 0,
      maxTime: sortedTimes[sortedTimes.length - 1] || 0,
      p95Time: sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0,
      p99Time: sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0,
      successRate: times.length / (times.length + errors + timeouts),
      throughput: (times.length * 1000) / totalTime,
      memoryUsage: process.memoryUsage(),
      errorCount: errors,
      timeoutCount: timeouts
    };
  }

  /**
   * Utility function to run performance test for a specific client
   */
  async function runPerformanceTest(
    client: ClaudeCodeCLIClient | ClaudeAPIClient,
    testName: string,
    iterations: number,
    concurrent: boolean = false
  ): Promise<PerformanceMetrics> {
    const times: number[] = [];
    let errors = 0;
    let timeouts = 0;

    const testMessage = `Respond with exactly: "Performance test ${testName} - iteration"`;

    if (concurrent) {
      // Run all iterations concurrently
      const promises = Array.from({ length: iterations }, async (_, i) => {
        const startTime = performance.now();
        
        try {
          const response = await client.sendMessage({
            message: `${testMessage} ${i + 1}`,
            model: 'claude-3-haiku-20240307',
            maxTokens: 50
          });
          
          const endTime = performance.now();
          times.push(endTime - startTime);
          
          expect(response.content).toBeDefined();
        } catch (error) {
          if (error.message.includes('timeout')) {
            timeouts++;
          } else {
            errors++;
          }
        }
      });

      await Promise.all(promises);
    } else {
      // Run iterations sequentially
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        try {
          const response = await client.sendMessage({
            message: `${testMessage} ${i + 1}`,
            model: 'claude-3-haiku-20240307',
            maxTokens: 50
          });
          
          const endTime = performance.now();
          times.push(endTime - startTime);
          
          expect(response.content).toBeDefined();
        } catch (error) {
          if (error.message.includes('timeout')) {
            timeouts++;
          } else {
            errors++;
          }
        }

        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return calculateMetrics(times, errors, timeouts);
  }

  describe('Single Request Performance', () => {
    test('should measure single request latency', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping CLI single request test - CLI not available');
        return;
      }

      const iterations = 10;
      console.log(`📊 Running single request latency test (${iterations} iterations)`);
      
      const cliMetrics = await runPerformanceTest(cliClient, 'CLI-single', iterations);
      
      console.log('CLI Single Request Metrics:', {
        averageTime: `${cliMetrics.averageTime.toFixed(2)}ms`,
        p95Time: `${cliMetrics.p95Time.toFixed(2)}ms`,
        successRate: `${(cliMetrics.successRate * 100).toFixed(1)}%`,
        throughput: `${cliMetrics.throughput.toFixed(2)} req/sec`
      });

      // Performance expectations for single requests
      expect(cliMetrics.averageTime).toBeLessThan(15000); // 15s average
      expect(cliMetrics.successRate).toBeGreaterThan(0.8); // 80% success rate
      expect(cliMetrics.errorCount).toBeLessThan(iterations * 0.2); // Less than 20% errors
    }, 180000);

    test('should compare CLI vs API single request performance', async () => {
      if (!cliAvailable || !cliAuthenticated || !apiKeyAvailable) {
        console.log('⚠️  Skipping CLI vs API comparison - one or both clients unavailable');
        return;
      }

      const iterations = 5; // Smaller number for comparison test
      console.log(`🏁 Running CLI vs API comparison test (${iterations} iterations each)`);

      const [cliMetrics, apiMetrics] = await Promise.all([
        runPerformanceTest(cliClient, 'CLI-comparison', iterations),
        runPerformanceTest(apiClient, 'API-comparison', iterations)
      ]);

      const comparison: ComparisonResult = {
        cli: cliMetrics,
        api: apiMetrics,
        comparison: {
          timeRatio: cliMetrics.averageTime / apiMetrics.averageTime,
          throughputRatio: cliMetrics.throughput / apiMetrics.throughput,
          memoryRatio: cliMetrics.memoryUsage ? 
            cliMetrics.memoryUsage.heapUsed / apiMetrics.memoryUsage!.heapUsed : 
            undefined,
          winner: cliMetrics.averageTime < apiMetrics.averageTime ? 'cli' : 'api',
          recommendation: cliMetrics.averageTime < apiMetrics.averageTime * 1.2 ? 
            'CLI performance is competitive' : 
            'API may be more performant for this use case'
        }
      };

      console.log('📊 CLI vs API Performance Comparison:');
      console.log('CLI Metrics:', {
        avgTime: `${cliMetrics.averageTime.toFixed(2)}ms`,
        throughput: `${cliMetrics.throughput.toFixed(2)} req/sec`,
        successRate: `${(cliMetrics.successRate * 100).toFixed(1)}%`
      });
      console.log('API Metrics:', {
        avgTime: `${apiMetrics.averageTime.toFixed(2)}ms`,
        throughput: `${apiMetrics.throughput.toFixed(2)} req/sec`,
        successRate: `${(apiMetrics.successRate * 100).toFixed(1)}%`
      });
      console.log('Comparison:', {
        timeRatio: `${comparison.comparison.timeRatio.toFixed(2)}x`,
        throughputRatio: `${comparison.comparison.throughputRatio.toFixed(2)}x`,
        winner: comparison.comparison.winner,
        recommendation: comparison.comparison.recommendation
      });

      // Both should have reasonable performance
      expect(cliMetrics.successRate).toBeGreaterThan(0.6);
      expect(apiMetrics.successRate).toBeGreaterThan(0.6);
      expect(comparison.comparison.timeRatio).toBeLessThan(5); // CLI shouldn't be 5x slower than API
    }, 300000);
  });

  describe('Concurrent Request Performance', () => {
    test('should handle concurrent CLI requests efficiently', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping concurrent CLI test - CLI not available');
        return;
      }

      const concurrentRequests = 5;
      console.log(`⚡ Running concurrent CLI test (${concurrentRequests} concurrent requests)`);
      
      const cliMetrics = await runPerformanceTest(cliClient, 'CLI-concurrent', concurrentRequests, true);
      
      console.log('CLI Concurrent Request Metrics:', {
        averageTime: `${cliMetrics.averageTime.toFixed(2)}ms`,
        maxTime: `${cliMetrics.maxTime.toFixed(2)}ms`,
        successRate: `${(cliMetrics.successRate * 100).toFixed(1)}%`,
        throughput: `${cliMetrics.throughput.toFixed(2)} req/sec`
      });

      // Concurrent requests should still perform reasonably
      expect(cliMetrics.averageTime).toBeLessThan(30000); // 30s average for concurrent
      expect(cliMetrics.successRate).toBeGreaterThan(0.6); // 60% success rate minimum
      expect(cliMetrics.throughput).toBeGreaterThan(0.1); // At least 0.1 req/sec
    }, 240000);

    test('should compare concurrent performance CLI vs API', async () => {
      if (!cliAvailable || !cliAuthenticated || !apiKeyAvailable) {
        console.log('⚠️  Skipping concurrent comparison - one or both clients unavailable');
        return;
      }

      const concurrentRequests = 3; // Smaller for comparison
      console.log(`🏁 Running concurrent CLI vs API test (${concurrentRequests} concurrent each)`);

      const [cliMetrics, apiMetrics] = await Promise.all([
        runPerformanceTest(cliClient, 'CLI-concurrent-comp', concurrentRequests, true),
        runPerformanceTest(apiClient, 'API-concurrent-comp', concurrentRequests, true)
      ]);

      console.log('📊 Concurrent Performance Comparison:');
      console.log('CLI:', {
        avgTime: `${cliMetrics.averageTime.toFixed(2)}ms`,
        maxTime: `${cliMetrics.maxTime.toFixed(2)}ms`,
        throughput: `${cliMetrics.throughput.toFixed(2)} req/sec`
      });
      console.log('API:', {
        avgTime: `${apiMetrics.averageTime.toFixed(2)}ms`,
        maxTime: `${apiMetrics.maxTime.toFixed(2)}ms`,
        throughput: `${apiMetrics.throughput.toFixed(2)} req/sec`
      });

      const throughputRatio = cliMetrics.throughput / apiMetrics.throughput;
      const latencyRatio = cliMetrics.averageTime / apiMetrics.averageTime;

      console.log('Ratios:', {
        throughputRatio: `${throughputRatio.toFixed(2)}x`,
        latencyRatio: `${latencyRatio.toFixed(2)}x`
      });

      // Both should handle concurrency reasonably
      expect(cliMetrics.successRate).toBeGreaterThan(0.5);
      expect(apiMetrics.successRate).toBeGreaterThan(0.5);
    }, 360000);
  });

  describe('Memory Usage and Resource Management', () => {
    test('should monitor CLI memory usage during operations', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping CLI memory test - CLI not available');
        return;
      }

      const initialMemory = process.memoryUsage();
      console.log('📊 Initial Memory Usage:', {
        rss: `${Math.round(initialMemory.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(initialMemory.heapTotal / 1024 / 1024)}MB`
      });

      // Run sustained operations
      const operations = 20;
      const memoryCheckpoints: any[] = [];

      for (let i = 0; i < operations; i++) {
        try {
          await cliClient.sendMessage({
            message: `Memory test iteration ${i + 1}`,
            model: 'claude-3-haiku-20240307',
            maxTokens: 50
          });

          if (i % 5 === 0) {
            const memory = process.memoryUsage();
            memoryCheckpoints.push({
              iteration: i,
              rss: memory.rss,
              heapUsed: memory.heapUsed,
              heapTotal: memory.heapTotal
            });
          }
        } catch (error) {
          console.log(`Memory test iteration ${i + 1} failed:`, error.message);
        }

        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryGrowthMB = memoryGrowth / 1024 / 1024;

      console.log('📊 Final Memory Usage:', {
        rss: `${Math.round(finalMemory.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`,
        growth: `${Math.round(memoryGrowthMB)}MB`
      });

      console.log('📈 Memory Checkpoints:', memoryCheckpoints.map(cp => ({
        iteration: cp.iteration,
        heapUsed: `${Math.round(cp.heapUsed / 1024 / 1024)}MB`
      })));

      // Memory growth should be reasonable
      expect(memoryGrowthMB).toBeLessThan(100); // Less than 100MB growth
      
      // Check for memory leaks (growth should be sublinear)
      const midCheckpoint = memoryCheckpoints[Math.floor(memoryCheckpoints.length / 2)];
      const finalCheckpoint = memoryCheckpoints[memoryCheckpoints.length - 1];
      
      if (midCheckpoint && finalCheckpoint) {
        const midGrowth = midCheckpoint.heapUsed - initialMemory.heapUsed;
        const finalGrowth = finalCheckpoint.heapUsed - initialMemory.heapUsed;
        const growthRatio = finalGrowth / midGrowth;
        
        expect(growthRatio).toBeLessThan(3); // Growth shouldn't be more than 3x in second half
      }
    }, 300000);

    test('should validate process pool resource management', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping process pool test - CLI not available');
        return;
      }

      const poolStats = await processPool.getStats();
      console.log('🏊 Initial Process Pool Stats:', poolStats);

      expect(poolStats).toHaveProperty('totalProcesses');
      expect(poolStats).toHaveProperty('activeProcesses');
      expect(poolStats).toHaveProperty('idleProcesses');
      expect(poolStats.activeProcesses).toBeGreaterThanOrEqual(0);
      expect(poolStats.idleProcesses).toBeGreaterThanOrEqual(0);

      // Test process pool utilization
      const poolOperations = 10;
      const operationPromises = Array.from({ length: poolOperations }, async (_, i) => {
        const process = await processPool.acquireProcess();
        expect(process).toBeDefined();
        
        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await processPool.releaseProcess(process);
      });

      await Promise.all(operationPromises);

      const finalPoolStats = await processPool.getStats();
      console.log('🏊 Final Process Pool Stats:', finalPoolStats);

      // Pool should be healthy after operations
      expect(finalPoolStats.totalProcesses).toBeGreaterThanOrEqual(1);
      expect(finalPoolStats.activeProcesses).toBe(0); // All processes should be released
    }, 60000);
  });

  describe('Performance Optimization Analysis', () => {
    test('should analyze and provide optimization recommendations', async () => {
      const recommendations = await performanceMonitor.getOptimizationRecommendations();
      
      console.log('🚀 Performance Optimization Recommendations:', 
        JSON.stringify(recommendations, null, 2));

      expect(Array.isArray(recommendations)).toBe(true);
      
      recommendations.forEach(rec => {
        expect(rec).toHaveProperty('type');
        expect(rec).toHaveProperty('description');
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('expectedImprovement');
        expect(['low', 'medium', 'high', 'critical']).toContain(rec.priority);
      });

      // Should provide at least basic recommendations
      expect(recommendations.length).toBeGreaterThan(0);
    });

    test('should provide performance grading', async () => {
      const performanceStats = performanceMonitor.getPerformanceStats();
      const grade = await performanceMonitor.calculatePerformanceGrade(performanceStats);
      
      console.log('📝 Performance Grade:', grade);

      expect(grade).toHaveProperty('letter');
      expect(grade).toHaveProperty('score');
      expect(grade).toHaveProperty('breakdown');
      expect(['A', 'B', 'C', 'D', 'F']).toContain(grade.letter);
      expect(grade.score).toBeGreaterThanOrEqual(0);
      expect(grade.score).toBeLessThanOrEqual(100);
      
      console.log('📊 Performance Breakdown:', grade.breakdown);
    });

    test('should compare performance against baselines', async () => {
      const performanceStats = performanceMonitor.getPerformanceStats();
      const comparison = await performanceMonitor.compareAgainstBaseline(performanceStats);
      
      console.log('📊 Baseline Comparison:', comparison);

      expect(comparison).toHaveProperty('current');
      expect(comparison).toHaveProperty('baseline');
      expect(comparison).toHaveProperty('improvement');
      expect(comparison).toHaveProperty('recommendation');

      // Should provide meaningful comparison data
      expect(typeof comparison.improvement).toBe('number');
      expect(typeof comparison.recommendation).toBe('string');
    });
  });

  describe('Load Testing and Stress Analysis', () => {
    test('should handle sustained load gracefully', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping load test - CLI not available');
        return;
      }

      const loadDuration = 30000; // 30 seconds
      const targetRate = 2; // 2 requests per second
      const maxConcurrent = 3;

      let completedRequests = 0;
      let errorCount = 0;
      const startTime = performance.now();
      const responseTimes: number[] = [];

      console.log(`🔥 Running sustained load test (${loadDuration/1000}s at ${targetRate} req/sec)`);

      const activeRequests = new Set<Promise<void>>();

      while (performance.now() - startTime < loadDuration) {
        if (activeRequests.size < maxConcurrent) {
          const requestStart = performance.now();
          
          const requestPromise = (async () => {
            try {
              await cliClient.sendMessage({
                message: `Load test request ${completedRequests + 1}`,
                model: 'claude-3-haiku-20240307',
                maxTokens: 30
              });
              
              const requestEnd = performance.now();
              responseTimes.push(requestEnd - requestStart);
              completedRequests++;
            } catch (error) {
              errorCount++;
              console.log(`Request ${completedRequests + errorCount} failed:`, error.message);
            }
          })();

          activeRequests.add(requestPromise);
          requestPromise.finally(() => activeRequests.delete(requestPromise));

          // Control request rate
          await new Promise(resolve => setTimeout(resolve, 1000 / targetRate));
        } else {
          // Wait for some requests to complete
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Wait for remaining requests
      await Promise.all(Array.from(activeRequests));

      const totalTime = performance.now() - startTime;
      const actualRate = (completedRequests * 1000) / totalTime;
      const successRate = completedRequests / (completedRequests + errorCount);
      const avgResponseTime = responseTimes.length > 0 ? 
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;

      console.log('🔥 Load Test Results:', {
        duration: `${(totalTime / 1000).toFixed(1)}s`,
        completedRequests,
        errorCount,
        actualRate: `${actualRate.toFixed(2)} req/sec`,
        successRate: `${(successRate * 100).toFixed(1)}%`,
        avgResponseTime: `${avgResponseTime.toFixed(2)}ms`
      });

      // Load test expectations
      expect(successRate).toBeGreaterThan(0.7); // 70% success rate under load
      expect(actualRate).toBeGreaterThan(targetRate * 0.5); // At least 50% of target rate
      expect(avgResponseTime).toBeLessThan(20000); // 20s average under load
    }, 60000);
  });

  describe('Summary and Recommendations', () => {
    test('should generate comprehensive performance report', async () => {
      const performanceStats = performanceMonitor.getPerformanceStats();
      const recommendations = await performanceMonitor.getOptimizationRecommendations();
      const grade = await performanceMonitor.calculatePerformanceGrade(performanceStats);

      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          cliAvailable,
          cliAuthenticated,
          apiAvailable: apiKeyAvailable,
          totalProcesses: performanceStats.totalProcesses,
          successRate: performanceStats.successRate,
          averageExecutionTime: performanceStats.averageExecutionTime
        },
        performance: {
          grade: grade.letter,
          score: grade.score,
          breakdown: grade.breakdown
        },
        recommendations: recommendations.slice(0, 5), // Top 5 recommendations
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memory: process.memoryUsage()
        }
      };

      console.log('📋 Comprehensive Performance Report:');
      console.log(JSON.stringify(report, null, 2));

      // Validate report structure
      expect(report.summary).toBeDefined();
      expect(report.performance).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.environment).toBeDefined();

      // Report should indicate overall health
      if (cliAvailable && cliAuthenticated) {
        expect(report.summary.totalProcesses).toBeGreaterThanOrEqual(0);
        expect(report.performance.score).toBeGreaterThan(0);
      }
    });
  });
});