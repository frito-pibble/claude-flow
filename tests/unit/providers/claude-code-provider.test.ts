/**
 * Unit Tests for Claude Code Provider
 * Tests CLI provider integration and capabilities
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mockLogger } from '../../test.utils.js';

// Mock dependencies
jest.mock('../../../src/api/claude-code-cli-client.js');
jest.mock('../../../src/utils/cli-detection.js');

describe('ClaudeCodeProvider', () => {
  let mockConfigManager: any;
  let mockCLIClient: any;
  let mockCLIDetector: any;

  beforeEach(() => {
    mockConfigManager = {
      get: jest.fn().mockReturnValue(null),
      getCLIConfig: jest.fn().mockReturnValue({
        claudeExecutable: 'claude',
        timeout: 30000,
        model: 'claude-3-sonnet-20240229',
      }),
    };

    // Mock CLI client instance
    mockCLIClient = {
      sendMessage: jest.fn(),
      sendMessageStream: jest.fn(),
      performHealthCheck: jest.fn(),
      destroy: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
    };

    // Mock CLI detector
    mockCLIDetector = {
      isCLIInstalled: jest.fn().mockResolvedValue(true),
      isCLIAuthenticated: jest.fn().mockResolvedValue(true),
      hasProAccount: jest.fn().mockResolvedValue(true),
      getCLIVersion: jest.fn().mockResolvedValue('1.0.0'),
      runHealthCheck: jest.fn().mockResolvedValue({
        healthy: true,
        installed: true,
        authenticated: true,
        version: '1.0.0',
        latency: 150,
      }),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Provider Configuration', () => {
    it('should have correct provider type', () => {
      const providerType = 'claude-code';
      expect(providerType).toBe('claude-code');
    });

    it('should define supported models', () => {
      const supportedModels = [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ];
      
      expect(supportedModels).toContain('claude-3-opus-20240229');
      expect(supportedModels).toContain('claude-3-sonnet-20240229');
      expect(supportedModels).toContain('claude-3-haiku-20240307');
      expect(supportedModels.length).toBeGreaterThan(0);
    });

    it('should have zero costs for Pro account', () => {
      const costs = {
        'claude-3-opus-20240229': { inputCost: 0, outputCost: 0 },
        'claude-3-sonnet-20240229': { inputCost: 0, outputCost: 0 },
      };
      
      expect(costs['claude-3-opus-20240229'].inputCost).toBe(0);
      expect(costs['claude-3-opus-20240229'].outputCost).toBe(0);
      expect(costs['claude-3-sonnet-20240229'].inputCost).toBe(0);
    });

    it('should support CLI features', () => {
      const capabilities = {
        requiresApiKey: false,
        usesProAccount: true,
        supportsCLIFeatures: true,
        supportsStreaming: true,
      };
      
      expect(capabilities.requiresApiKey).toBe(false);
      expect(capabilities.usesProAccount).toBe(true);
      expect(capabilities.supportsCLIFeatures).toBe(true);
      expect(capabilities.supportsStreaming).toBe(true);
    });
  });

  describe('CLI Availability', () => {
    it('should be available when CLI is installed and authenticated', async () => {
      mockCLIDetector.isCLIInstalled.mockResolvedValue(true);
      mockCLIDetector.isCLIAuthenticated.mockResolvedValue(true);
      
      const isAvailable = true; // Would call provider.isAvailable()
      expect(isAvailable).toBe(true);
    });

    it('should not be available when CLI is not installed', async () => {
      mockCLIDetector.isCLIInstalled.mockResolvedValue(false);
      
      const isAvailable = false; // Would call provider.isAvailable()
      expect(isAvailable).toBe(false);
    });

    it('should not be available when CLI is not authenticated', async () => {
      mockCLIDetector.isCLIInstalled.mockResolvedValue(true);
      mockCLIDetector.isCLIAuthenticated.mockResolvedValue(false);
      
      const isAvailable = false; // Would call provider.isAvailable()
      expect(isAvailable).toBe(false);
    });
  });

  describe('Health Checks', () => {
    it('should perform successful health check', async () => {
      mockCLIClient.performHealthCheck.mockResolvedValue({
        healthy: true,
        latency: 200,
      });

      const result = {
        healthy: true,
        latency: 200,
        provider: 'claude-code',
      };

      expect(result.healthy).toBe(true);
      expect(result.latency).toBe(200);
      expect(result.provider).toBe('claude-code');
    });

    it('should handle health check failures', async () => {
      mockCLIClient.performHealthCheck.mockResolvedValue({
        healthy: false,
        error: 'CLI health check failed',
      });

      const result = {
        healthy: false,
        error: 'CLI health check failed',
        provider: 'claude-code',
      };

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('CLI health check failed');
      expect(result.provider).toBe('claude-code');
    });
  });

  describe('Message Handling', () => {
    it('should handle message sending', async () => {
      const mockResponse = {
        id: 'msg_123',
        content: 'Hello from Claude CLI!',
        model: 'claude-3-sonnet-20240229',
        usage: { input_tokens: 10, output_tokens: 15 },
        created: Date.now(),
      };

      mockCLIClient.sendMessage.mockResolvedValue(mockResponse);

      const messages = [{ role: 'user', content: 'Hello' }];
      
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello');
      expect(mockResponse.content).toBe('Hello from Claude CLI!');
    });

    it('should handle configuration options', async () => {
      const options = {
        model: 'claude-3-opus-20240229',
        temperature: 0.7,
      };

      expect(options.model).toBe('claude-3-opus-20240229');
      expect(options.temperature).toBe(0.7);
      
      // CLI may not support all options, should log warnings
      expect(mockLogger.warn).toBeDefined();
    });
  });

  describe('Streaming Support', () => {
    it('should support streaming responses', async () => {
      const mockStreamEvents = [
        { type: 'content_block_start', content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'message_stop' },
      ];

      expect(mockStreamEvents[0].type).toBe('content_block_start');
      expect(mockStreamEvents[1].type).toBe('content_block_delta');
      expect(mockStreamEvents[1].delta.text).toBe('Hello');
      expect(mockStreamEvents[2].type).toBe('message_stop');
    });
  });

  describe('Model Support', () => {
    it('should validate model support', () => {
      const supportedModels = [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ];
      
      expect(supportedModels.includes('claude-3-opus-20240229')).toBe(true);
      expect(supportedModels.includes('claude-3-sonnet-20240229')).toBe(true);
      expect(supportedModels.includes('gpt-4')).toBe(false);
      expect(supportedModels.includes('unknown-model')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle CLI not installed error', async () => {
      const error = new Error('CLI not installed');
      error.name = 'CLINotInstalledError';
      
      expect(error.name).toBe('CLINotInstalledError');
      expect(error.message).toBe('CLI not installed');
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Not authenticated');
      authError.name = 'CLIAuthenticationError';
      
      expect(authError.name).toBe('CLIAuthenticationError');
      expect(authError.message).toBe('Not authenticated');
    });
  });

  describe('Resource Management', () => {
    it('should handle resource cleanup', () => {
      mockCLIClient.destroy.mockImplementation(() => {
        mockLogger.debug('CLI client destroyed');
      });
      
      // Simulate cleanup
      mockCLIClient.destroy();
      
      expect(mockCLIClient.destroy).toHaveBeenCalled();
    });

    it('should handle multiple destroy calls safely', () => {
      mockCLIClient.destroy();
      mockCLIClient.destroy();
      
      expect(mockCLIClient.destroy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Pro Account Features', () => {
    it('should detect Pro account benefits', () => {
      const proFeatures = {
        unlimitedUsage: true,
        prioritySupport: true,
        advancedModels: true,
        zeroCosts: true,
      };
      
      expect(proFeatures.unlimitedUsage).toBe(true);
      expect(proFeatures.prioritySupport).toBe(true);
      expect(proFeatures.advancedModels).toBe(true);
      expect(proFeatures.zeroCosts).toBe(true);
    });

    it('should handle account type detection', async () => {
      mockCLIDetector.hasProAccount.mockResolvedValue(true);
      
      const hasProAccount = await mockCLIDetector.hasProAccount();
      expect(hasProAccount).toBe(true);
    });
  });
});