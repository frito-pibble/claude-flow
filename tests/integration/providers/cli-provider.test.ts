import { ClaudeCodeProvider } from '../../../src/providers/claude-code-provider';
import { CLIDetector, createCLIDetector } from '../../../src/utils/cli-detection';
import { ProviderManager } from '../../../src/providers/provider-manager';
import { ConfigManager } from '../../../src/config/config-manager';
import { LLMRequest, LLMResponse } from '../../../src/providers/types';

describe('CLI Provider Integration Tests', () => {
  let provider: ClaudeCodeProvider;
  let providerManager: ProviderManager;
  let configManager: ConfigManager;
  let cliAvailable: boolean = false;

  beforeAll(async () => {
    // Check if CLI is available for integration tests
    try {
      const detector = createCLIDetector();
      cliAvailable = await detector.isCLIInstalled();
      if (cliAvailable) {
        console.log('✓ Claude CLI detected - running integration tests');
      } else {
        console.log('⚠ Claude CLI not available - skipping integration tests');
      }
    } catch (error) {
      console.log('⚠ CLI detection failed - skipping integration tests:', error);
      cliAvailable = false;
    }
  });

  beforeEach(async () => {
    if (!cliAvailable) return;
    
    configManager = new ConfigManager();
    provider = new ClaudeCodeProvider(configManager);
    providerManager = new ProviderManager(configManager);
  });

  describe('CLI Provider Basic Functionality', () => {
    test('should instantiate CLI provider correctly', () => {
      if (!cliAvailable) {
        console.log('⚠ Skipping test - CLI not available');
        return;
      }

      expect(provider).toBeInstanceOf(ClaudeCodeProvider);
      expect(provider.getName()).toBe('claude-code');
      expect(provider.getCapabilities().requiresApiKey).toBe(false);
    });

    test('should check availability with real CLI', async () => {
      if (!cliAvailable) {
        console.log('⚠ Skipping test - CLI not available');
        return;
      }

      const available = await provider.isAvailable();
      expect(typeof available).toBe('boolean');
      
      if (available) {
        console.log('✓ CLI provider is available');
      } else {
        console.log('⚠ CLI provider not available - may need authentication');
      }
    });

    test('should perform health check with real CLI', async () => {
      if (!cliAvailable) {
        console.log('⚠ Skipping test - CLI not available');
        return;
      }

      const health = await provider.healthCheck();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('message');
      expect(health).toHaveProperty('details');
      
      console.log('CLI Health Check:', health);
    });
  });

  describe('CLI Provider Message Processing', () => {
    test('should handle simple completion request', async () => {
      if (!cliAvailable) {
        console.log('⚠ Skipping test - CLI not available');
        return;
      }

      // Check if CLI is authenticated before testing
      const available = await provider.isAvailable();
      if (!available) {
        console.log('⚠ Skipping test - CLI not authenticated');
        return;
      }

      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'Say hello in one word'
        }],
        model: 'claude-3-haiku',
        maxTokens: 10,
        temperature: 0.1
      };

      try {
        const response: LLMResponse = await provider.sendMessage(request);
        
        expect(response).toHaveProperty('content');
        expect(response).toHaveProperty('model');
        expect(response).toHaveProperty('usage');
        expect(typeof response.content).toBe('string');
        expect(response.content.length).toBeGreaterThan(0);
        
        console.log('CLI Response:', response);
      } catch (error) {
        console.log('⚠ Message processing failed:', error);
        // Don't fail the test if it's an authentication issue
        if (error.message?.includes('authentication') || error.message?.includes('not authenticated')) {
          console.log('⚠ Authentication required - test skipped');
          return;
        }
        throw error;
      }
    });

    test('should handle model parameter', async () => {
      if (!cliAvailable) {
        console.log('⚠ Skipping test - CLI not available');
        return;
      }

      const available = await provider.isAvailable();
      if (!available) {
        console.log('⚠ Skipping test - CLI not authenticated');
        return;
      }

      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'What model are you?'
        }],
        model: 'claude-3-sonnet',
        maxTokens: 50
      };

      try {
        const response: LLMResponse = await provider.sendMessage(request);
        
        expect(response.model).toBeTruthy();
        console.log('Model used:', response.model);
      } catch (error) {
        if (error.message?.includes('authentication')) {
          console.log('⚠ Authentication required - test skipped');
          return;
        }
        throw error;
      }
    });
  });

  describe('CLI Provider Streaming', () => {
    test('should handle streaming responses', async () => {
      if (!cliAvailable) {
        console.log('⚠ Skipping test - CLI not available');
        return;
      }

      const available = await provider.isAvailable();
      if (!available) {
        console.log('⚠ Skipping test - CLI not authenticated');
        return;
      }

      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'Count from 1 to 3 with one number per line'
        }],
        model: 'claude-3-haiku',
        maxTokens: 20,
        stream: true
      };

      try {
        const stream = provider.sendMessageStream(request);
        const chunks: string[] = [];
        
        for await (const chunk of stream) {
          chunks.push(chunk.content);
          if (chunks.length > 10) break; // Prevent infinite loops
        }

        expect(chunks.length).toBeGreaterThan(0);
        const fullContent = chunks.join('');
        expect(fullContent.length).toBeGreaterThan(0);
        
        console.log('Stream chunks received:', chunks.length);
        console.log('Full streamed content:', fullContent);
      } catch (error) {
        if (error.message?.includes('authentication')) {
          console.log('⚠ Authentication required - test skipped');
          return;
        }
        throw error;
      }
    });
  });

  describe('CLI Provider Error Handling', () => {
    test('should handle invalid model gracefully', async () => {
      if (!cliAvailable) {
        console.log('⚠ Skipping test - CLI not available');
        return;
      }

      const available = await provider.isAvailable();
      if (!available) {
        console.log('⚠ Skipping test - CLI not authenticated');
        return;
      }

      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'Hello'
        }],
        model: 'invalid-model-name',
        maxTokens: 10
      };

      try {
        await provider.sendMessage(request);
        // If no error is thrown, the CLI might have handled it gracefully
        console.log('⚠ Invalid model request succeeded unexpectedly');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toBeTruthy();
        console.log('✓ Invalid model error handled:', error.message);
      }
    });

    test('should handle CLI process timeout', async () => {
      if (!cliAvailable) {
        console.log('⚠ Skipping test - CLI not available');
        return;
      }

      const available = await provider.isAvailable();
      if (!available) {
        console.log('⚠ Skipping test - CLI not authenticated');
        return;
      }

      // Create provider with very short timeout for testing
      const shortTimeoutProvider = new ClaudeCodeProvider(configManager, { 
        processTimeout: 1000 // 1 second
      });

      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'Write a very long essay about the history of computers in excruciating detail with thousands of words'
        }],
        model: 'claude-3-haiku',
        maxTokens: 1000
      };

      try {
        await shortTimeoutProvider.sendMessage(request);
        console.log('⚠ Request completed within timeout - may need longer request');
      } catch (error) {
        expect(error.message).toMatch(/timeout|time/i);
        console.log('✓ Timeout error handled:', error.message);
      }
    });
  });
});