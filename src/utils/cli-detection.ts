/**
 * Claude Code CLI Detection and Authentication Utility
 * 
 * Provides comprehensive CLI detection, authentication checking, and health monitoring
 * for Claude Code CLI integration with intelligent caching and error handling.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { ILogger } from '../core/logger.js';
import { getErrorMessage } from './error-handler.js';

export interface HealthResult {
  available: boolean;
  authenticated: boolean;
  hasProAccount: boolean;
  version?: string;
  error?: string;
  lastChecked: number;
  responseTime: number;
}

export interface CLISetupGuidance {
  step: string;
  title: string;
  description: string;
  command?: string;
  url?: string;
  required: boolean;
}

export interface CLIDetectionConfig {
  cacheTimeout?: number; // How long to cache CLI availability checks (default: 5 minutes)
  healthCheckTimeout?: number; // Timeout for individual health checks (default: 10 seconds)
  maxRetries?: number; // Max retries for failed checks (default: 3)
  authCheckInterval?: number; // How often to check auth status (default: 15 minutes)
}

/**
 * Claude Code CLI Detector
 * Handles detection, authentication, and health checking for Claude Code CLI
 */
export class CLIDetector extends EventEmitter {
  private logger?: ILogger;
  private config: Required<CLIDetectionConfig>;
  private lastHealthCheck: HealthResult | null = null;
  private authCheckTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(logger?: ILogger, config: CLIDetectionConfig = {}) {
    super();
    this.logger = logger;
    
    this.config = {
      cacheTimeout: config.cacheTimeout || 300000, // 5 minutes
      healthCheckTimeout: config.healthCheckTimeout || 10000, // 10 seconds
      maxRetries: config.maxRetries || 3,
      authCheckInterval: config.authCheckInterval || 900000, // 15 minutes
    };
  }

  /**
   * Check if Claude Code CLI is installed
   */
  async isCLIInstalled(): Promise<boolean> {
    try {
      await this.executeCommand(['--version'], { timeout: 5000 });
      return true;
    } catch (error) {
      this.logger?.debug('CLI not installed:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Check if Claude Code CLI is authenticated
   */
  async isCLIAuthenticated(): Promise<boolean> {
    try {
      const result = await this.executeCommand(['doctor'], { timeout: 10000 });
      
      // Parse doctor output for authentication status
      const output = result.stdout.toLowerCase();
      return output.includes('authenticated') || 
             output.includes('logged in') || 
             !output.includes('not authenticated');
    } catch (error) {
      this.logger?.debug('CLI authentication check failed:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Detect if user has Pro account
   */
  async hasProAccount(): Promise<boolean> {
    try {
      const result = await this.executeCommand(['doctor'], { timeout: 10000 });
      
      // Look for Pro account indicators in doctor output
      const output = result.stdout.toLowerCase();
      return output.includes('pro') || 
             output.includes('professional') ||
             output.includes('subscription');
    } catch (error) {
      this.logger?.debug('Pro account detection failed:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Get Claude Code CLI version
   */
  async getCLIVersion(): Promise<string> {
    try {
      const result = await this.executeCommand(['--version'], { timeout: 5000 });
      
      // Extract version from output
      const versionMatch = result.stdout.match(/(\d+\.\d+\.\d+)/);
      return versionMatch ? versionMatch[1] : 'unknown';
    } catch (error) {
      this.logger?.debug('Version detection failed:', getErrorMessage(error));
      return 'unknown';
    }
  }

  /**
   * Perform comprehensive health check with intelligent caching
   */
  async runHealthCheck(forceRefresh = false): Promise<HealthResult> {
    const now = Date.now();
    
    // Use cached result if available and not expired (unless forced refresh)
    if (!forceRefresh && 
        this.lastHealthCheck && 
        (now - this.lastHealthCheck.lastChecked) < this.config.cacheTimeout) {
      this.logger?.debug('Using cached CLI health check result');
      return this.lastHealthCheck;
    }

    const startTime = Date.now();
    this.logger?.debug('Performing fresh CLI health check');

    try {
      // Check all aspects in parallel for better performance
      const [installed, authenticated, hasProAccount, version] = await Promise.all([
        this.isCLIInstalled(),
        this.isCLIAuthenticated(),
        this.hasProAccount(),
        this.getCLIVersion(),
      ]);

      const result: HealthResult = {
        available: installed,
        authenticated,
        hasProAccount,
        version,
        lastChecked: now,
        responseTime: Date.now() - startTime,
      };

      // Cache the result
      this.lastHealthCheck = result;

      // Emit health check event
      this.emit('health-check', result);

      this.logger?.debug('CLI health check completed:', {
        available: result.available,
        authenticated: result.authenticated,
        hasProAccount: result.hasProAccount,
        version: result.version,
        responseTime: result.responseTime,
      });

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const result: HealthResult = {
        available: false,
        authenticated: false,
        hasProAccount: false,
        error: errorMessage,
        lastChecked: now,
        responseTime: Date.now() - startTime,
      };

      // Cache error result for shorter time to allow quick retry
      this.lastHealthCheck = { ...result, lastChecked: now - (this.config.cacheTimeout * 0.8) };

      this.logger?.warn('CLI health check failed:', errorMessage);
      this.emit('health-check-failed', result);

      return result;
    }
  }

  /**
   * Check if CLI is available (installed and authenticated)
   */
  async isCLIAvailable(): Promise<boolean> {
    const health = await this.runHealthCheck();
    return health.available && health.authenticated;
  }

  /**
   * Get setup guidance based on current CLI status
   */
  async getCLISetupGuidance(): Promise<CLISetupGuidance[]> {
    const health = await this.runHealthCheck();
    const guidance: CLISetupGuidance[] = [];

    if (!health.available) {
      guidance.push({
        step: '1',
        title: 'Install Claude Code CLI',
        description: 'Download and install the Claude Code CLI from the official website.',
        url: 'https://claude.ai/code',
        required: true,
      });
    }

    if (health.available && !health.authenticated) {
      guidance.push({
        step: '2',
        title: 'Authenticate with Claude Code',
        description: 'Log in to your Claude account using the CLI.',
        command: 'claude auth login',
        required: true,
      });
    }

    if (health.available && health.authenticated && !health.hasProAccount) {
      guidance.push({
        step: '3',
        title: 'Upgrade to Pro Account (Optional)',
        description: 'Consider upgrading to Claude Pro for unlimited usage and no cost tracking.',
        url: 'https://claude.ai/upgrade',
        required: false,
      });
    }

    if (health.available && health.authenticated) {
      guidance.push({
        step: 'verify',
        title: 'Verify Installation',
        description: 'Test your Claude Code CLI installation.',
        command: 'claude doctor',
        required: false,
      });
    }

    return guidance;
  }

  /**
   * Start periodic authentication monitoring
   */
  startMonitoring(): void {
    if (this.isRunning) {
      this.logger?.warn('CLI monitoring already running');
      return;
    }

    this.logger?.info('Starting CLI authentication monitoring');
    this.isRunning = true;

    // Perform initial health check
    this.runHealthCheck(true);

    // Set up periodic authentication checks
    this.authCheckTimer = setInterval(async () => {
      try {
        await this.runHealthCheck(true);
      } catch (error) {
        this.logger?.error('Periodic auth check failed:', getErrorMessage(error));
      }
    }, this.config.authCheckInterval);

    this.emit('monitoring-started');
  }

  /**
   * Stop periodic authentication monitoring
   */
  stopMonitoring(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger?.info('Stopping CLI authentication monitoring');
    this.isRunning = false;

    if (this.authCheckTimer) {
      clearInterval(this.authCheckTimer);
      this.authCheckTimer = null;
    }

    this.emit('monitoring-stopped');
  }

  /**
   * Get cached health result without performing new check
   */
  getCachedHealthResult(): HealthResult | null {
    return this.lastHealthCheck;
  }

  /**
   * Clear health check cache
   */
  clearCache(): void {
    this.lastHealthCheck = null;
    this.logger?.debug('CLI health check cache cleared');
  }

  /**
   * Check if health check cache is still valid
   */
  isCacheValid(): boolean {
    if (!this.lastHealthCheck) return false;
    
    const now = Date.now();
    return (now - this.lastHealthCheck.lastChecked) < this.config.cacheTimeout;
  }

  /**
   * Execute Claude CLI command with proper error handling and timeout
   */
  private async executeCommand(
    args: string[], 
    options: { timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const timeout = options.timeout || this.config.healthCheckTimeout;

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let isResolved = false;

      // Spawn the claude command
      const child: ChildProcess = spawn('claude', args, {
        stdio: 'pipe',
        shell: true,
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          child.kill('SIGTERM');
          reject(new Error(`CLI command timeout after ${timeout}ms`));
        }
      }, timeout);

      // Handle stdout
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // Handle stderr
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      child.on('close', (exitCode) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);

          if (exitCode === 0) {
            resolve({ stdout, stderr, exitCode });
          } else {
            reject(new Error(`CLI command failed with exit code ${exitCode}: ${stderr || stdout}`));
          }
        }
      });

      // Handle process errors
      child.on('error', (error) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          reject(new Error(`CLI process error: ${getErrorMessage(error)}`));
        }
      });
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<CLIDetectionConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CLIDetectionConfig>): void {
    Object.assign(this.config, config);
    this.logger?.debug('CLI detection configuration updated');
  }

  /**
   * Check if monitoring is currently active
   */
  isMonitoring(): boolean {
    return this.isRunning;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopMonitoring();
    this.clearCache();
    this.removeAllListeners();
  }
}

/**
 * Global CLI detector instance
 */
let globalCLIDetector: CLIDetector | null = null;

/**
 * Get or create global CLI detector instance
 */
export function getCLIDetector(logger?: ILogger): CLIDetector {
  if (!globalCLIDetector) {
    globalCLIDetector = new CLIDetector(logger);
  }
  return globalCLIDetector;
}

/**
 * Quick utility functions for common CLI checks
 */
export const cliUtils = {
  /**
   * Quick check if CLI is ready to use
   */
  async isReady(): Promise<boolean> {
    const detector = getCLIDetector();
    return await detector.isCLIAvailable();
  },

  /**
   * Get setup guidance for CLI configuration
   */
  async getSetupSteps(): Promise<CLISetupGuidance[]> {
    const detector = getCLIDetector();
    return await detector.getCLISetupGuidance();
  },

  /**
   * Perform health check and return simplified result
   */
  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    const detector = getCLIDetector();
    const health = await detector.runHealthCheck();
    
    if (health.available && health.authenticated) {
      return { 
        ok: true, 
        message: `Claude Code CLI ready${health.hasProAccount ? ' (Pro Account)' : ''}` 
      };
    } else if (health.available && !health.authenticated) {
      return { 
        ok: false, 
        message: 'Claude Code CLI installed but not authenticated. Run: claude auth login' 
      };
    } else {
      return { 
        ok: false, 
        message: 'Claude Code CLI not installed. Visit: https://claude.ai/code' 
      };
    }
  },
};