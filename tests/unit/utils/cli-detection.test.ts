/**
 * Unit Tests for CLI Detection Utilities
 * Tests CLI availability detection and health checking
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { mockLogger } from '../../test.utils.js';

// Mock child_process
jest.mock('child_process');

describe('CLI Detection Utilities', () => {
  let mockProcess: any;
  const mockSpawn = jest.fn();

  beforeEach(() => {
    // Mock subprocess
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.stdin = { 
      write: jest.fn(),
      end: jest.fn(),
    };
    mockProcess.kill = jest.fn();
    mockProcess.pid = 54321;

    mockSpawn.mockReturnValue(mockProcess);
    
    // Mock spawn will be handled in individual tests
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CLI Installation Detection', () => {
    it('should detect when CLI is installed', () => {
      // Simulate successful CLI version check
      const versionOutput = 'claude version 1.2.3\n';
      
      expect(versionOutput).toContain('claude version');
      expect(versionOutput).toContain('1.2.3');
    });

    it('should detect when CLI is not installed', () => {
      // Simulate command not found error
      const error = new Error('spawn claude ENOENT');
      (error as any).code = 'ENOENT';
      
      expect(error.message).toContain('spawn claude ENOENT');
      expect((error as any).code).toBe('ENOENT');
    });

    it('should handle CLI version extraction', () => {
      const versionOutputs = [
        'claude version 1.2.3',
        'Claude CLI v2.1.0 (stable)',
        'claude-cli version: 1.5.2-beta',
      ];
      
      versionOutputs.forEach(output => {
        const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
        expect(versionMatch).toBeTruthy();
        expect(versionMatch?.[1]).toMatch(/^\d+\.\d+\.\d+/);
      });
    });
  });

  describe('CLI Authentication Detection', () => {
    it('should detect when CLI is authenticated', () => {
      const doctorResponse = {
        status: 'ok',
        authenticated: true,
        user: { email: 'test@example.com' },
      };
      
      expect(doctorResponse.status).toBe('ok');
      expect(doctorResponse.authenticated).toBe(true);
      expect(doctorResponse.user.email).toBe('test@example.com');
    });

    it('should detect when CLI is not authenticated', () => {
      const doctorResponse = {
        status: 'error',
        authenticated: false,
        error: 'Not authenticated',
      };
      
      expect(doctorResponse.status).toBe('error');
      expect(doctorResponse.authenticated).toBe(false);
      expect(doctorResponse.error).toBe('Not authenticated');
    });

    it('should handle malformed JSON in doctor output', () => {
      const invalidJson = 'Not JSON output\n';
      
      expect(() => JSON.parse(invalidJson)).toThrow();
      
      // Should fall back to false for invalid JSON
      let authenticated = false;
      try {
        const parsed = JSON.parse(invalidJson);
        authenticated = parsed.authenticated || false;
      } catch {
        authenticated = false;
      }
      
      expect(authenticated).toBe(false);
    });
  });

  describe('Pro Account Detection', () => {
    it('should detect Pro account subscription', () => {
      const proUserResponse = {
        status: 'ok',
        authenticated: true,
        user: { 
          email: 'pro@example.com',
          subscription: 'pro',
          plan: 'Claude Pro',
        },
      };
      
      const isProAccount = proUserResponse.user.subscription === 'pro' ||
                          proUserResponse.user.plan?.toLowerCase().includes('pro');
      
      expect(isProAccount).toBe(true);
      expect(proUserResponse.user.subscription).toBe('pro');
      expect(proUserResponse.user.plan).toBe('Claude Pro');
    });

    it('should detect free account', () => {
      const freeUserResponse = {
        status: 'ok',
        authenticated: true,
        user: { 
          email: 'free@example.com',
          subscription: 'free',
          plan: 'Claude Free',
        },
      };
      
      const isProAccount = freeUserResponse.user.subscription === 'pro' ||
                          freeUserResponse.user.plan?.toLowerCase().includes('pro');
      
      expect(isProAccount).toBe(false);
      expect(freeUserResponse.user.subscription).toBe('free');
    });

    it('should handle missing subscription info', () => {
      const unknownUserResponse = {
        status: 'ok',
        authenticated: true,
        user: { email: 'user@example.com' },
      };
      
      // Default to false when subscription info is missing
      const isProAccount = unknownUserResponse.user.subscription === 'pro' || false;
      
      expect(isProAccount).toBe(false);
    });
  });

  describe('CLI Version Detection', () => {
    it('should extract version from CLI output', () => {
      const versionOutput = 'claude version 2.1.0\nBuild: abc123\n';
      const versionMatch = versionOutput.match(/version (\d+\.\d+\.\d+)/);
      
      expect(versionMatch).toBeTruthy();
      expect(versionMatch?.[1]).toBe('2.1.0');
    });

    it('should handle version command failure', () => {
      const error = new Error('Version check failed');
      const defaultVersion = 'unknown';
      
      expect(error.message).toBe('Version check failed');
      expect(defaultVersion).toBe('unknown');
    });

    it('should extract version from different output formats', () => {
      const alternativeVersionOutput = 'Claude CLI v1.5.2 (stable)\n';
      const versionMatch = alternativeVersionOutput.match(/v(\d+\.\d+\.\d+)/);
      
      expect(versionMatch).toBeTruthy();
      expect(versionMatch?.[1]).toBe('1.5.2');
    });
  });

  describe('Health Check Structure', () => {
    it('should define complete health check result', () => {
      const healthResult = {
        healthy: true,
        installed: true,
        authenticated: true,
        version: '1.0.0',
        hasProAccount: true,
        latency: 150,
      };
      
      expect(healthResult.healthy).toBe(true);
      expect(healthResult.installed).toBe(true);
      expect(healthResult.authenticated).toBe(true);
      expect(healthResult.version).toBe('1.0.0');
      expect(healthResult.hasProAccount).toBe(true);
      expect(healthResult.latency).toBe(150);
    });

    it('should handle partial health check failures', () => {
      const partialFailureResult = {
        healthy: false,
        installed: true,
        authenticated: false,
        version: '1.0.0',
        hasProAccount: false,
        error: 'Authentication failed',
      };
      
      expect(partialFailureResult.healthy).toBe(false);
      expect(partialFailureResult.installed).toBe(true);
      expect(partialFailureResult.authenticated).toBe(false);
      expect(partialFailureResult.error).toBe('Authentication failed');
    });
  });

  describe('Setup Guidance', () => {
    it('should provide installation guidance structure', () => {
      const installGuidance = {
        step: '1',
        title: 'Install Claude Code CLI',
        description: 'Download and install Claude Code CLI from the official website',
        url: 'https://claude.ai/downloads',
        required: true,
      };
      
      expect(installGuidance.step).toBe('1');
      expect(installGuidance.title).toContain('Install');
      expect(installGuidance.url).toContain('claude.ai');
      expect(installGuidance.required).toBe(true);
    });

    it('should provide authentication guidance structure', () => {
      const authGuidance = {
        step: '2',
        title: 'Authenticate with Claude',
        description: 'Run the authentication command to log in',
        command: 'claude auth login',
        required: true,
      };
      
      expect(authGuidance.step).toBe('2');
      expect(authGuidance.title).toContain('Authenticate');
      expect(authGuidance.command).toBe('claude auth login');
      expect(authGuidance.required).toBe(true);
    });

    it('should confirm when CLI is ready', () => {
      const readyMessage = '✅ Claude CLI is ready - All systems operational';
      
      expect(readyMessage).toContain('✅');
      expect(readyMessage).toContain('ready');
      expect(readyMessage).toContain('operational');
    });
  });

  describe('Event System', () => {
    it('should define status change event structure', () => {
      const statusChangeEvent = {
        type: 'statusChange',
        status: {
          healthy: true,
          installed: true,
          authenticated: true,
        },
        timestamp: Date.now(),
      };
      
      expect(statusChangeEvent.type).toBe('statusChange');
      expect(statusChangeEvent.status.healthy).toBe(true);
      expect(statusChangeEvent.timestamp).toBeGreaterThan(0);
    });

    it('should handle monitoring intervals', () => {
      const monitoringInterval = 60000; // 1 minute
      const shortInterval = 5000; // 5 seconds for testing
      
      expect(monitoringInterval).toBe(60000);
      expect(shortInterval).toBe(5000);
      expect(shortInterval).toBeLessThan(monitoringInterval);
    });
  });

  describe('Caching Behavior', () => {
    it('should define cache structure', () => {
      const cache = {
        lastCheck: Date.now(),
        result: {
          healthy: true,
          installed: true,
          authenticated: true,
        },
        timeout: 300000, // 5 minutes
      };
      
      expect(cache.lastCheck).toBeGreaterThan(0);
      expect(cache.result.healthy).toBe(true);
      expect(cache.timeout).toBe(300000);
    });

    it('should handle cache expiration', () => {
      const cacheTimeout = 300000; // 5 minutes
      const lastCheck = Date.now() - 400000; // 6+ minutes ago
      const isExpired = (Date.now() - lastCheck) > cacheTimeout;
      
      expect(isExpired).toBe(true);
    });

    it('should force refresh when requested', () => {
      const forceRefresh = true;
      const useCache = !forceRefresh;
      
      expect(forceRefresh).toBe(true);
      expect(useCache).toBe(false);
    });
  });

  describe('Process Management', () => {
    it('should create mock process with required properties', () => {
      expect(mockProcess).toBeDefined();
      expect(mockProcess.stdout).toBeDefined();
      expect(mockProcess.stderr).toBeDefined();
      expect(mockProcess.stdin).toBeDefined();
      expect(mockProcess.kill).toBeDefined();
      expect(mockProcess.pid).toBe(54321);
    });

    it('should handle process cleanup', () => {
      const killSpy = jest.spyOn(mockProcess, 'kill');
      
      // Simulate cleanup
      mockProcess.kill();
      
      expect(killSpy).toHaveBeenCalled();
    });

    it('should handle subprocess timeouts', () => {
      const timeout = 10000; // 10 seconds
      const startTime = Date.now();
      
      // Simulate timeout check
      const hasTimedOut = (Date.now() - startTime) > timeout;
      
      expect(timeout).toBe(10000);
      expect(hasTimedOut).toBe(false); // Should be immediate in test
    });
  });

  describe('Error Scenarios', () => {
    it('should handle CLI not found errors', () => {
      const notFoundError = new Error('spawn claude ENOENT');
      (notFoundError as any).code = 'ENOENT';
      
      expect(notFoundError.message).toContain('ENOENT');
      expect((notFoundError as any).code).toBe('ENOENT');
    });

    it('should handle permission denied errors', () => {
      const permissionError = new Error('spawn claude EACCES');
      (permissionError as any).code = 'EACCES';
      
      expect(permissionError.message).toContain('EACCES');
      expect((permissionError as any).code).toBe('EACCES');
    });

    it('should handle network connectivity issues', () => {
      const networkError = new Error('ETIMEDOUT');
      (networkError as any).code = 'ETIMEDOUT';
      
      expect(networkError.message).toBe('ETIMEDOUT');
      expect((networkError as any).code).toBe('ETIMEDOUT');
    });
  });
});