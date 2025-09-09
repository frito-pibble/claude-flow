/**
 * CLI Performance Optimization and Monitoring
 * Provides process pooling, performance tracking, and optimization utilities for Claude Code CLI integration
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { performance } from 'perf_hooks';
import { ILogger } from '../core/logger.js';
import { CLIDetector } from './cli-detection.js';

export interface CLIProcessOptions {
  timeout?: number;
  workingDirectory?: string;
  environmentVariables?: Record<string, string>;
  enableMetrics?: boolean;
}

export interface CLIProcessMetrics {
  processId: string;
  command: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  exitCode?: number;
  memoryUsage?: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  cpuUsage?: {
    user: number;
    system: number;
  };
  outputSize: number;
  errorOutput?: string;
  success: boolean;
}

export interface CLIPerformanceStats {
  totalProcesses: number;
  activeProcesses: number;
  averageExecutionTime: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  p95ExecutionTime: number;
  successRate: number;
  totalMemoryUsage: number;
  averageMemoryUsage: number;
  processPoolHitRate: number;
  lastUpdated: Date;
}

export interface CLIPoolOptions {
  maxPoolSize?: number;
  idleTimeout?: number;
  maxLifetime?: number;
  enableHealthChecks?: boolean;
  healthCheckInterval?: number;
  preSpawnProcesses?: number;
}

interface PooledProcess {
  id: string;
  process: ChildProcess;
  createdAt: Date;
  lastUsed: Date;
  isActive: boolean;
  reuseCount: number;
  maxReuses: number;
}

/**
 * CLI Process Pool Manager
 * Provides process pooling for CLI operations to reduce spawn overhead
 */
export class CLIProcessPool extends EventEmitter {
  private pool: PooledProcess[] = [];
  private activeProcesses = new Map<string, PooledProcess>();
  private metrics: CLIProcessMetrics[] = [];
  private cleanupTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  
  private readonly options: Required<CLIPoolOptions> = {
    maxPoolSize: 5,
    idleTimeout: 300000, // 5 minutes
    maxLifetime: 1800000, // 30 minutes
    enableHealthChecks: true,
    healthCheckInterval: 60000, // 1 minute
    preSpawnProcesses: 2,
  };

  constructor(
    private logger: ILogger,
    private cliDetector: CLIDetector,
    options: CLIPoolOptions = {}
  ) {
    super();
    this.options = { ...this.options, ...options };
    this.setupCleanup();
    this.setupHealthChecks();
    this.preSpawnProcesses();
  }

  /**
   * Execute a CLI command using the process pool
   */
  async execute(
    args: string[],
    options: CLIProcessOptions = {}
  ): Promise<{ stdout: string; stderr: string; metrics: CLIProcessMetrics }> {
    const processId = `cli_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    const metrics: CLIProcessMetrics = {
      processId,
      command: args.join(' '),
      startTime,
      outputSize: 0,
      success: false,
    };

    try {
      this.logger.debug('CLI process execution started', { processId, command: metrics.command });

      // Try to get a pooled process or create new one
      const pooledProcess = this.getOrCreateProcess();
      let process: ChildProcess;
      let usingPool = false;

      if (pooledProcess && this.isProcessHealthy(pooledProcess.process)) {
        process = pooledProcess.process;
        pooledProcess.lastUsed = new Date();
        pooledProcess.reuseCount++;
        usingPool = true;
        this.logger.debug('Using pooled CLI process', { processId, poolId: pooledProcess.id });
      } else {
        // Create new process
        process = await this.createCLIProcess(args, options);
        this.logger.debug('Created new CLI process', { processId });
      }

      // Execute command and collect metrics
      const result = await this.executeWithProcess(process, args, options, metrics);
      
      // Update metrics
      metrics.endTime = performance.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      metrics.success = result.exitCode === 0;
      metrics.outputSize = result.stdout.length + result.stderr.length;

      if (options.enableMetrics !== false) {
        this.collectProcessMetrics(process, metrics);
        this.metrics.push(metrics);
        
        // Keep only recent metrics (last 1000)
        if (this.metrics.length > 1000) {
          this.metrics = this.metrics.slice(-1000);
        }
      }

      // Return process to pool or cleanup
      if (usingPool && pooledProcess && this.shouldReturnToPool(pooledProcess)) {
        this.returnToPool(pooledProcess);
      } else if (pooledProcess) {
        this.removeFromPool(pooledProcess.id);
      }

      this.logger.debug('CLI process execution completed', {
        processId,
        duration: metrics.duration,
        success: metrics.success,
        usingPool,
      });

      this.emit('processCompleted', metrics);

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        metrics,
      };

    } catch (error) {
      metrics.endTime = performance.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      metrics.errorOutput = error instanceof Error ? error.message : String(error);
      metrics.success = false;

      this.logger.error('CLI process execution failed', {
        processId,
        error: metrics.errorOutput,
        duration: metrics.duration,
      });

      if (options.enableMetrics !== false) {
        this.metrics.push(metrics);
      }

      this.emit('processError', { metrics, error });
      throw error;
    }
  }

  /**
   * Get current performance statistics
   */
  getPerformanceStats(): CLIPerformanceStats {
    const completedMetrics = this.metrics.filter(m => m.endTime !== undefined);
    const durations = completedMetrics.map(m => m.duration!).filter(d => d > 0);
    const successfulMetrics = completedMetrics.filter(m => m.success);
    
    // Calculate percentiles
    const sortedDurations = durations.sort((a, b) => a - b);
    const p95Index = Math.floor(sortedDurations.length * 0.95);
    const p95ExecutionTime = sortedDurations[p95Index] || 0;

    // Calculate pool hit rate
    const poolHits = this.metrics.filter(m => m.processId.includes('pooled')).length;
    const totalProcesses = this.metrics.length;
    const processPoolHitRate = totalProcesses > 0 ? (poolHits / totalProcesses) * 100 : 0;

    // Calculate memory stats
    const memoryMetrics = completedMetrics.filter(m => m.memoryUsage);
    const totalMemoryUsage = memoryMetrics.reduce((sum, m) => sum + (m.memoryUsage?.rss || 0), 0);
    const averageMemoryUsage = memoryMetrics.length > 0 ? totalMemoryUsage / memoryMetrics.length : 0;

    return {
      totalProcesses: completedMetrics.length,
      activeProcesses: this.activeProcesses.size,
      averageExecutionTime: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      minExecutionTime: Math.min(...durations) || 0,
      maxExecutionTime: Math.max(...durations) || 0,
      p95ExecutionTime,
      successRate: completedMetrics.length > 0 ? (successfulMetrics.length / completedMetrics.length) * 100 : 0,
      totalMemoryUsage,
      averageMemoryUsage,
      processPoolHitRate,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get recent process metrics
   */
  getRecentMetrics(limit: number = 50): CLIProcessMetrics[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Clear collected metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.logger.info('CLI performance metrics cleared');
  }

  /**
   * Get pool status
   */
  getPoolStatus(): {
    poolSize: number;
    activeProcesses: number;
    idleProcesses: number;
    maxPoolSize: number;
    totalReuses: number;
  } {
    const idleProcesses = this.pool.filter(p => !p.isActive).length;
    const totalReuses = this.pool.reduce((sum, p) => sum + p.reuseCount, 0);

    return {
      poolSize: this.pool.length,
      activeProcesses: this.activeProcesses.size,
      idleProcesses,
      maxPoolSize: this.options.maxPoolSize,
      totalReuses,
    };
  }

  /**
   * Shutdown the pool and cleanup all processes
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down CLI process pool');

    // Clear timers
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    // Cleanup all processes
    const cleanupPromises: Promise<void>[] = [];

    // Cleanup pooled processes
    for (const pooledProcess of this.pool) {
      cleanupPromises.push(this.cleanupProcess(pooledProcess.process));
    }

    // Cleanup active processes
    for (const pooledProcess of this.activeProcesses.values()) {
      cleanupPromises.push(this.cleanupProcess(pooledProcess.process));
    }

    await Promise.allSettled(cleanupPromises);

    this.pool = [];
    this.activeProcesses.clear();

    this.logger.info('CLI process pool shutdown completed');
  }

  private async preSpawnProcesses(): Promise<void> {
    if (this.options.preSpawnProcesses <= 0) return;

    try {
      const isAvailable = await this.cliDetector.isCLIAvailable();
      if (!isAvailable) {
        this.logger.warn('CLI not available, skipping process pre-spawning');
        return;
      }

      for (let i = 0; i < this.options.preSpawnProcesses; i++) {
        try {
          await this.createPooledProcess();
        } catch (error) {
          this.logger.warn('Failed to pre-spawn CLI process', { error: error instanceof Error ? error.message : String(error) });
        }
      }

      this.logger.info('Pre-spawned CLI processes', { count: this.pool.length });
    } catch (error) {
      this.logger.error('Error during CLI process pre-spawning', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private getOrCreateProcess(): PooledProcess | null {
    // Try to get an idle process from pool
    const idleProcess = this.pool.find(p => !p.isActive && this.isProcessHealthy(p.process));
    
    if (idleProcess) {
      idleProcess.isActive = true;
      this.activeProcesses.set(idleProcess.id, idleProcess);
      return idleProcess;
    }

    // Create new process if pool not full
    if (this.pool.length < this.options.maxPoolSize) {
      try {
        return this.createPooledProcess();
      } catch (error) {
        this.logger.warn('Failed to create pooled process', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    return null;
  }

  private createPooledProcess(): PooledProcess {
    const pooledProcess: PooledProcess = {
      id: `pool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      process: spawn('claude', [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      }),
      createdAt: new Date(),
      lastUsed: new Date(),
      isActive: true,
      reuseCount: 0,
      maxReuses: 100, // Max reuses before forcing recreation
    };

    this.pool.push(pooledProcess);
    this.activeProcesses.set(pooledProcess.id, pooledProcess);

    this.logger.debug('Created pooled CLI process', { poolId: pooledProcess.id });

    return pooledProcess;
  }

  private async createCLIProcess(args: string[], options: CLIProcessOptions): Promise<ChildProcess> {
    const process = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: options.workingDirectory,
      env: { ...process.env, ...options.environmentVariables },
      detached: false,
    });

    return process;
  }

  private async executeWithProcess(
    process: ChildProcess,
    args: string[],
    options: CLIProcessOptions,
    metrics: CLIProcessMetrics
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const timeout = options.timeout || 30000;

      const timer = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`CLI process timeout after ${timeout}ms`));
      }, timeout);

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code });
      });

      process.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      // Send command if process is ready
      if (process.stdin) {
        process.stdin.write(args.join(' ') + '\n');
        process.stdin.end();
      }
    });
  }

  private collectProcessMetrics(process: ChildProcess, metrics: CLIProcessMetrics): void {
    try {
      if (process.pid) {
        const memoryUsage = process.memoryUsage?.();
        const cpuUsage = process.cpuUsage?.();

        if (memoryUsage) {
          metrics.memoryUsage = memoryUsage;
        }

        if (cpuUsage) {
          metrics.cpuUsage = {
            user: cpuUsage.user / 1000000, // Convert to seconds
            system: cpuUsage.system / 1000000,
          };
        }
      }
    } catch (error) {
      // Metrics collection is best effort, don't fail the operation
      this.logger.debug('Failed to collect process metrics', { 
        processId: metrics.processId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private isProcessHealthy(process: ChildProcess): boolean {
    return !process.killed && process.exitCode === null && process.pid !== undefined;
  }

  private shouldReturnToPool(pooledProcess: PooledProcess): boolean {
    const now = new Date();
    const ageMs = now.getTime() - pooledProcess.createdAt.getTime();
    
    return (
      this.isProcessHealthy(pooledProcess.process) &&
      ageMs < this.options.maxLifetime &&
      pooledProcess.reuseCount < pooledProcess.maxReuses
    );
  }

  private returnToPool(pooledProcess: PooledProcess): void {
    pooledProcess.isActive = false;
    this.activeProcesses.delete(pooledProcess.id);
    
    this.logger.debug('Returned process to pool', { 
      poolId: pooledProcess.id,
      reuseCount: pooledProcess.reuseCount 
    });
  }

  private removeFromPool(poolId: string): void {
    const index = this.pool.findIndex(p => p.id === poolId);
    if (index >= 0) {
      const pooledProcess = this.pool[index];
      this.pool.splice(index, 1);
      this.activeProcesses.delete(poolId);
      
      this.cleanupProcess(pooledProcess.process);
      
      this.logger.debug('Removed process from pool', { poolId });
    }
  }

  private async cleanupProcess(process: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      if (!process.killed && process.pid) {
        const timeout = setTimeout(() => {
          process.kill('SIGKILL');
          resolve();
        }, 5000);

        process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });

        process.kill('SIGTERM');
      } else {
        resolve();
      }
    });
  }

  private setupCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleProcesses();
    }, 60000); // Cleanup every minute
  }

  private setupHealthChecks(): void {
    if (!this.options.enableHealthChecks) return;

    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.options.healthCheckInterval);
  }

  private cleanupStaleProcesses(): void {
    const now = new Date();
    const processesToRemove: string[] = [];

    for (const pooledProcess of this.pool) {
      const idleTime = now.getTime() - pooledProcess.lastUsed.getTime();
      const age = now.getTime() - pooledProcess.createdAt.getTime();

      if (
        !this.isProcessHealthy(pooledProcess.process) ||
        (!pooledProcess.isActive && idleTime > this.options.idleTimeout) ||
        age > this.options.maxLifetime ||
        pooledProcess.reuseCount >= pooledProcess.maxReuses
      ) {
        processesToRemove.push(pooledProcess.id);
      }
    }

    for (const poolId of processesToRemove) {
      this.removeFromPool(poolId);
    }

    if (processesToRemove.length > 0) {
      this.logger.debug('Cleaned up stale CLI processes', { count: processesToRemove.length });
    }
  }

  private performHealthChecks(): void {
    let unhealthyCount = 0;

    for (const pooledProcess of this.pool) {
      if (!this.isProcessHealthy(pooledProcess.process)) {
        this.removeFromPool(pooledProcess.id);
        unhealthyCount++;
      }
    }

    if (unhealthyCount > 0) {
      this.logger.warn('Removed unhealthy CLI processes during health check', { count: unhealthyCount });
    }
  }
}

/**
 * CLI Performance Monitor
 * Provides comprehensive performance monitoring and optimization suggestions for CLI operations
 */
export class CLIPerformanceMonitor extends EventEmitter {
  private processPool: CLIProcessPool;
  private comparisonMetrics = new Map<string, number>();
  private optimizationSuggestions: string[] = [];

  constructor(
    private logger: ILogger,
    private cliDetector: CLIDetector,
    poolOptions: CLIPoolOptions = {}
  ) {
    super();
    this.processPool = new CLIProcessPool(logger, cliDetector, poolOptions);
    this.setupMonitoring();
  }

  /**
   * Execute CLI command with performance monitoring
   */
  async executeWithMonitoring(
    args: string[],
    options: CLIProcessOptions = {}
  ): Promise<{ stdout: string; stderr: string; metrics: CLIProcessMetrics }> {
    const enhancedOptions = { ...options, enableMetrics: true };
    return await this.processPool.execute(args, enhancedOptions);
  }

  /**
   * Get comprehensive performance statistics
   */
  getComprehensiveStats(): {
    cli: CLIPerformanceStats;
    pool: ReturnType<CLIProcessPool['getPoolStatus']>;
    optimization: {
      suggestions: string[];
      estimatedSavings: string;
      currentEfficiency: number;
    };
  } {
    const cliStats = this.processPool.getPerformanceStats();
    const poolStats = this.processPool.getPoolStatus();
    
    const currentEfficiency = this.calculateEfficiency(cliStats, poolStats);
    const estimatedSavings = this.calculateEstimatedSavings(cliStats, poolStats);

    return {
      cli: cliStats,
      pool: poolStats,
      optimization: {
        suggestions: [...this.optimizationSuggestions],
        estimatedSavings,
        currentEfficiency,
      },
    };
  }

  /**
   * Compare CLI vs API performance (when available)
   */
  recordAPIMetrics(operation: string, duration: number): void {
    this.comparisonMetrics.set(`api_${operation}`, duration);
    this.generateComparisonSuggestions();
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(): {
    priority: 'high' | 'medium' | 'low';
    category: string;
    suggestion: string;
    impact: string;
    implementation: string;
  }[] {
    const stats = this.processPool.getPerformanceStats();
    const poolStats = this.processPool.getPoolStatus();
    const recommendations: Array<{
      priority: 'high' | 'medium' | 'low';
      category: string;
      suggestion: string;
      impact: string;
      implementation: string;
    }> = [];

    // High execution time recommendation
    if (stats.averageExecutionTime > 2000) {
      recommendations.push({
        priority: 'high',
        category: 'Performance',
        suggestion: 'Average CLI execution time is high (>2s)',
        impact: 'Reduce response latency by 30-50%',
        implementation: 'Enable process pooling or increase pool size',
      });
    }

    // Low pool hit rate recommendation
    if (stats.processPoolHitRate < 50 && poolStats.poolSize > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'Process Pooling',
        suggestion: 'Low process pool hit rate detected',
        impact: 'Improve performance by reducing spawn overhead',
        implementation: 'Increase pool size or adjust idle timeout',
      });
    }

    // High memory usage recommendation
    if (stats.averageMemoryUsage > 100 * 1024 * 1024) { // 100MB
      recommendations.push({
        priority: 'medium',
        category: 'Memory',
        suggestion: 'High memory usage per CLI process',
        impact: 'Reduce memory footprint and improve scalability',
        implementation: 'Implement process recycling or reduce pool lifetime',
      });
    }

    // Low success rate recommendation
    if (stats.successRate < 95) {
      recommendations.push({
        priority: 'high',
        category: 'Reliability',
        suggestion: 'CLI process success rate below 95%',
        impact: 'Improve reliability and user experience',
        implementation: 'Review error patterns and implement retry logic',
      });
    }

    return recommendations;
  }

  /**
   * Shutdown the performance monitor
   */
  async shutdown(): Promise<void> {
    await this.processPool.shutdown();
    this.logger.info('CLI performance monitor shutdown completed');
  }

  private setupMonitoring(): void {
    this.processPool.on('processCompleted', (metrics: CLIProcessMetrics) => {
      this.analyzeMetrics(metrics);
    });

    this.processPool.on('processError', ({ metrics, error }) => {
      this.analyzeErrors(metrics, error);
    });

    // Generate optimization suggestions periodically
    setInterval(() => {
      this.generateOptimizationSuggestions();
    }, 300000); // Every 5 minutes
  }

  private analyzeMetrics(metrics: CLIProcessMetrics): void {
    // Analyze for patterns and potential optimizations
    if (metrics.duration && metrics.duration > 5000) {
      this.addOptimizationSuggestion(
        `Slow CLI execution detected (${Math.round(metrics.duration)}ms) for command: ${metrics.command}`
      );
    }

    if (metrics.memoryUsage && metrics.memoryUsage.rss > 200 * 1024 * 1024) { // 200MB
      this.addOptimizationSuggestion(
        `High memory usage detected (${Math.round(metrics.memoryUsage.rss / 1024 / 1024)}MB) for command: ${metrics.command}`
      );
    }
  }

  private analyzeErrors(metrics: CLIProcessMetrics, error: Error): void {
    this.addOptimizationSuggestion(
      `CLI process error pattern detected: ${error.message} (command: ${metrics.command})`
    );
  }

  private generateOptimizationSuggestions(): void {
    const stats = this.processPool.getPerformanceStats();
    
    // Clear old suggestions
    this.optimizationSuggestions = [];

    if (stats.averageExecutionTime > 1000) {
      this.addOptimizationSuggestion('Consider enabling process pooling to reduce CLI spawn overhead');
    }

    if (stats.processPoolHitRate < 70) {
      this.addOptimizationSuggestion('Increase process pool size to improve hit rate and performance');
    }

    if (stats.successRate < 98) {
      this.addOptimizationSuggestion('Implement error handling and retry logic for improved reliability');
    }
  }

  private generateComparisonSuggestions(): void {
    // Compare CLI vs API performance when both metrics are available
    for (const [operation, apiDuration] of this.comparisonMetrics.entries()) {
      const cliOperation = operation.replace('api_', 'cli_');
      const cliDuration = this.comparisonMetrics.get(cliOperation);
      
      if (cliDuration && apiDuration) {
        const improvement = ((apiDuration - cliDuration) / apiDuration) * 100;
        
        if (improvement > 20) {
          this.addOptimizationSuggestion(
            `CLI shows ${Math.round(improvement)}% performance improvement over API for ${operation}`
          );
        } else if (improvement < -20) {
          this.addOptimizationSuggestion(
            `API shows ${Math.round(-improvement)}% performance improvement over CLI for ${operation}. Consider API fallback.`
          );
        }
      }
    }
  }

  private addOptimizationSuggestion(suggestion: string): void {
    if (!this.optimizationSuggestions.includes(suggestion)) {
      this.optimizationSuggestions.push(suggestion);
      
      // Keep only recent suggestions (last 20)
      if (this.optimizationSuggestions.length > 20) {
        this.optimizationSuggestions = this.optimizationSuggestions.slice(-20);
      }
      
      this.emit('optimizationSuggestion', suggestion);
    }
  }

  private calculateEfficiency(cliStats: CLIPerformanceStats, poolStats: ReturnType<CLIProcessPool['getPoolStatus']>): number {
    // Calculate efficiency based on multiple factors
    const poolEfficiency = poolStats.maxPoolSize > 0 ? (poolStats.totalReuses / (poolStats.poolSize + 1)) : 0;
    const successRateEfficiency = cliStats.successRate / 100;
    const responseTimeEfficiency = Math.max(0, (5000 - cliStats.averageExecutionTime) / 5000);
    
    return Math.round((poolEfficiency * 0.3 + successRateEfficiency * 0.4 + responseTimeEfficiency * 0.3) * 100);
  }

  private calculateEstimatedSavings(cliStats: CLIPerformanceStats, poolStats: ReturnType<CLIProcessPool['getPoolStatus']>): string {
    const baseSpawnTime = 100; // Average process spawn time in ms
    const potentialSavings = poolStats.totalReuses * baseSpawnTime;
    const savingsSeconds = potentialSavings / 1000;
    
    if (savingsSeconds > 60) {
      return `${Math.round(savingsSeconds / 60)}m ${Math.round(savingsSeconds % 60)}s`;
    } else {
      return `${Math.round(savingsSeconds)}s`;
    }
  }
}

// Utility functions for external use
export const CLIPerformanceUtils = {
  /**
   * Create a performance monitor with default configuration
   */
  createMonitor(logger: ILogger, cliDetector: CLIDetector): CLIPerformanceMonitor {
    return new CLIPerformanceMonitor(logger, cliDetector, {
      maxPoolSize: 5,
      idleTimeout: 300000, // 5 minutes
      enableHealthChecks: true,
      preSpawnProcesses: 2,
    });
  },

  /**
   * Format performance metrics for display
   */
  formatStats(stats: CLIPerformanceStats): string {
    return [
      `Total Processes: ${stats.totalProcesses}`,
      `Active Processes: ${stats.activeProcesses}`,
      `Avg Execution Time: ${Math.round(stats.averageExecutionTime)}ms`,
      `P95 Execution Time: ${Math.round(stats.p95ExecutionTime)}ms`,
      `Success Rate: ${Math.round(stats.successRate)}%`,
      `Pool Hit Rate: ${Math.round(stats.processPoolHitRate)}%`,
      `Avg Memory Usage: ${Math.round(stats.averageMemoryUsage / 1024 / 1024)}MB`,
    ].join('\n');
  },

  /**
   * Get performance grade based on metrics
   */
  getPerformanceGrade(stats: CLIPerformanceStats): 'A' | 'B' | 'C' | 'D' | 'F' {
    let score = 0;
    
    // Response time score (0-30 points)
    if (stats.averageExecutionTime < 500) score += 30;
    else if (stats.averageExecutionTime < 1000) score += 25;
    else if (stats.averageExecutionTime < 2000) score += 15;
    else if (stats.averageExecutionTime < 5000) score += 5;
    
    // Success rate score (0-40 points)
    score += Math.round((stats.successRate / 100) * 40);
    
    // Pool efficiency score (0-30 points)
    if (stats.processPoolHitRate > 80) score += 30;
    else if (stats.processPoolHitRate > 60) score += 25;
    else if (stats.processPoolHitRate > 40) score += 15;
    else if (stats.processPoolHitRate > 20) score += 5;
    
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  },
};