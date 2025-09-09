/**
 * Test for CLI Error Handling System
 * Validates error mapping and user guidance functionality
 */

import { jest } from '@jest/globals';
import {
  CLIError,
  CLIErrorHandler,
  CLINotInstalledError,
  CLIAuthenticationError,
  CLIPermissionError,
  CLITimeoutError,
  CLINetworkError,
  CLIProcessError,
  isCLIError,
  getCLIErrorCode,
  getCLIGuidanceTemplate,
} from './cli-error-handling.js';

// Mock CLI detector for testing
jest.mock('./cli-detection.js', () => ({
  getCLIDetector: jest.fn(() => ({
    isCLIInstalled: jest.fn(() => Promise.resolve(true)),
    isCLIAuthenticated: jest.fn(() => Promise.resolve(true)),
  })),
}));

describe('CLI Error Handling', () => {
  describe('Error Classification', () => {
    test('should detect CLI not installed error', () => {
      const error = new Error('command not found: claude');
      const cliError = CLIErrorHandler.mapSubprocessError(error);
      
      expect(cliError).toBeInstanceOf(CLINotInstalledError);
      expect(cliError.cliCode).toBe('CLI_NOT_INSTALLED');
      expect(cliError.guidance).toContain('Install Claude Code CLI from https://claude.ai/downloads');
    });

    test('should detect authentication error', () => {
      const error = new Error('not authenticated');
      const cliError = CLIErrorHandler.mapSubprocessError(error);
      
      expect(cliError).toBeInstanceOf(CLIAuthenticationError);
      expect(cliError.cliCode).toBe('CLI_AUTH_ERROR');
      expect(cliError.guidance).toContain('Run "claude auth login" to authenticate');
    });

    test('should detect permission error', () => {
      const error = new Error('permission denied');
      const cliError = CLIErrorHandler.mapSubprocessError(error, undefined, undefined, 'file operation');
      
      expect(cliError).toBeInstanceOf(CLIPermissionError);
      expect(cliError.cliCode).toBe('CLI_PERMISSION_ERROR');
      expect(cliError.message).toContain('file operation');
    });

    test('should detect network error', () => {
      const error = new Error('connection failed');
      const cliError = CLIErrorHandler.mapSubprocessError(error);
      
      expect(cliError).toBeInstanceOf(CLINetworkError);
      expect(cliError.cliCode).toBe('CLI_NETWORK_ERROR');
      expect(cliError.guidance).toContain('Check your internet connection');
    });

    test('should handle exit code based errors', () => {
      const error = new Error('Process failed');
      const cliError = CLIErrorHandler.mapSubprocessError(error, 127); // Command not found
      
      expect(cliError).toBeInstanceOf(CLINotInstalledError);
    });

    test('should fallback to generic process error', () => {
      const error = new Error('Unknown error');
      const cliError = CLIErrorHandler.mapSubprocessError(error, 42);
      
      expect(cliError).toBeInstanceOf(CLIProcessError);
      expect(cliError.cliCode).toBe('CLI_PROCESS_ERROR');
    });
  });

  describe('Error Detection Utilities', () => {
    test('should identify CLI errors', () => {
      const cliError = new CLINotInstalledError();
      const regularError = new Error('Regular error');
      
      expect(isCLIError(cliError)).toBe(true);
      expect(isCLIError(regularError)).toBe(false);
    });

    test('should extract CLI error codes', () => {
      const cliError = new CLIAuthenticationError('Auth failed');
      const regularError = new Error('Regular error');
      
      expect(getCLIErrorCode(cliError)).toBe('CLI_AUTH_ERROR');
      expect(getCLIErrorCode(regularError)).toBeUndefined();
    });
  });

  describe('Guidance Templates', () => {
    test('should provide setup guidance template', () => {
      const template = getCLIGuidanceTemplate('SETUP_GUIDANCE');
      
      expect(template).toContain('Claude CLI Setup Required');
      expect(template).toContain('Install Claude CLI from https://claude.ai/downloads');
      expect(template).toContain('claude auth login');
    });

    test('should provide authentication guidance template', () => {
      const template = getCLIGuidanceTemplate('AUTH_GUIDANCE');
      
      expect(template).toContain('Authentication Required');
      expect(template).toContain('claude auth login');
    });

    test('should provide network guidance template', () => {
      const template = getCLIGuidanceTemplate('NETWORK_GUIDANCE');
      
      expect(template).toContain('Network Connectivity Issue');
      expect(template).toContain('Check your internet connection');
    });
  });

  describe('Error Message Formatting', () => {
    test('should format user message for CLI errors', async () => {
      const cliError = new CLINotInstalledError();
      const message = await CLIErrorHandler.formatUserMessage(cliError, false);
      
      expect(message).toContain('Claude Code CLI is not installed');
      expect(message).toContain('Install Claude Code CLI from https://claude.ai/downloads');
      expect(message).toContain('🔧 Suggested Actions:');
    });

    test('should include technical details when requested', async () => {
      const cliError = new CLIProcessError(1, 'stderr output', { pid: 1234 });
      const message = await CLIErrorHandler.formatUserMessage(cliError, true);
      
      expect(message).toContain('📋 Technical Details:');
      expect(message).toContain('stderr output');
    });
  });

  describe('Troubleshooting Guidance', () => {
    test('should provide contextual troubleshooting guidance', async () => {
      const cliError = new CLIAuthenticationError('Auth failed');
      const guidance = await CLIErrorHandler.getTroubleshootingGuidance(cliError);
      
      expect(guidance).toContain('🔧 Suggested Actions:');
      expect(guidance.join('\n')).toContain('claude auth login');
    });
  });

  describe('Error Creation and Properties', () => {
    test('should create CLI errors with proper properties', () => {
      const guidance = ['Step 1', 'Step 2'];
      const error = new CLIError('Test message', 'TEST_CODE', guidance, { extra: 'data' });
      
      expect(error.message).toBe('Test message');
      expect(error.cliCode).toBe('TEST_CODE');
      expect(error.guidance).toEqual(guidance);
      expect(error.details).toEqual({ extra: 'data' });
      expect(error.name).toBe('CLIError');
    });

    test('should create timeout errors with proper timeout value', () => {
      const timeoutError = new CLITimeoutError(5000, 'test operation', { context: 'test' });
      
      expect(timeoutError.message).toContain('5000ms');
      expect(timeoutError.message).toContain('test operation');
      expect(timeoutError.cliCode).toBe('CLI_TIMEOUT');
    });

    test('should create permission errors with operation context', () => {
      const permError = new CLIPermissionError('file write', { path: '/test' });
      
      expect(permError.message).toContain('file write');
      expect(permError.cliCode).toBe('CLI_PERMISSION_ERROR');
      expect(permError.details).toEqual({ path: '/test' });
    });
  });

  describe('Integration with CLI Detector', () => {
    test('should provide contextual guidance based on CLI status', async () => {
      const cliError = new CLINotInstalledError();
      const guidance = await CLIErrorHandler.getTroubleshootingGuidance(cliError);
      
      // Should include CLI status check results
      expect(guidance.length).toBeGreaterThan(0);
      expect(guidance.join('\n')).toContain('🔧 Suggested Actions:');
    });
  });

  describe('Error Message Templates', () => {
    test('should have consistent template structure', () => {
      const templates = ['SETUP_GUIDANCE', 'AUTH_GUIDANCE', 'PERMISSION_GUIDANCE', 'NETWORK_GUIDANCE', 'PERFORMANCE_GUIDANCE'] as const;
      
      templates.forEach(templateKey => {
        const template = getCLIGuidanceTemplate(templateKey);
        
        expect(template).toMatch(/🚀|🔐|🛡️|🌐|⚡/); // Should have emoji
        expect(template.split('\n').length).toBeGreaterThan(1); // Should be multi-line
      });
    });
  });
});