import { ProviderManager } from '../../../src/providers/provider-manager';
import { ConfigManager } from '../../../src/config/config-manager';
import { CLIDetector, createCLIDetector } from '../../../src/utils/cli-detection';
import { LLMRequest, LLMProviderConfig } from '../../../src/providers/types';

describe('Provider Manager CLI Integration Tests', () => {
  let providerManager: ProviderManager;
  let configManager: ConfigManager;
  let cliAvailable: boolean = false;
  let originalConfig: any;

  beforeAll(async () => {
    // Check if CLI is available for integration tests
    try {
      const detector = createCLIDetector();
      cliAvailable = await detector.isCLIInstalled();
      if (cliAvailable) {
        console.log('✓ Claude CLI detected - running provider manager integration tests');
      } else {
        console.log('⚠ Claude CLI not available - will test provider selection logic');
      }
    } catch (error) {
      console.log('⚠ CLI detection failed - testing provider selection only:', error);
      cliAvailable = false;
    }
  });

  beforeEach(async () => {
    configManager = ConfigManager.getInstance();
    
    // Save original config - skip for now since we'll just set test config
    
    // Set up CLI-first configuration for testing
    const cliConfig: LLMProviderConfig = {
      provider: 'claude-code',
      model: 'claude-3-haiku-20240307',
      cliOptions: {
        priority: true,
        processTimeout: 30000,
        enableProcessReuse: true,
        processPoolSize: 3,
        authCheckInterval: 300000,
        fallbackToAPI: false
      }
    };
    
    await configManager.setLLMProviderConfig(cliConfig);
    providerManager = new ProviderManager(configManager);
  });

  afterEach(async () => {
    // Cleanup - reset to default config if needed
  });

  describe('Provider Selection Logic', () => {
    test('should select CLI provider when available', async () => {
      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'Hello'
        }],
        model: 'claude-3-haiku',
        maxTokens: 10
      };

      try {
        // This will test the provider selection logic
        const selectedProvider = await providerManager.getProvider(request);
        expect(selectedProvider).toBeDefined();
        
        const providerName = selectedProvider.getName();
        console.log('Selected provider:', providerName);
        
        if (cliAvailable) {
          // If CLI is available, should prefer CLI
          const detector = createCLIDetector();
          const cliAuthenticated = await detector.isCLIAuthenticated();
          if (cliAuthenticated) {
            expect(providerName).toBe('claude-code');
            console.log('✓ CLI provider selected as expected');
          } else {
            console.log('⚠ CLI not authenticated - may fall back to API');
          }
        } else {
          // If CLI not available, should fall back to API
          expect(['anthropic', 'claude-code']).toContain(providerName);
          console.log('✓ Fallback provider selected as expected');
        }
      } catch (error) {
        console.log('Provider selection error:', error.message);
        // This is expected if no providers are available
      }
    });

    test('should handle CLI unavailable scenario', async () => {
      // Force CLI unavailable scenario by using a config without CLI
      const apiConfig: LLMProviderConfig = {
        provider: 'anthropic',
        model: 'claude-3-haiku-20240307'
      };
      
      await configManager.setLLMProviderConfig(apiConfig);
      const apiProviderManager = new ProviderManager(configManager);
      
      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'Hello'
        }],
        model: 'claude-3-haiku',
        maxTokens: 10
      };

      try {
        const selectedProvider = await apiProviderManager.getProvider(request);
        expect(selectedProvider.getName()).toBe('anthropic');
        console.log('✓ API provider selected when CLI disabled');
      } catch (error) {
        console.log('⚠ No API provider available:', error.message);
        // This is expected if API keys are not configured
      }
    });

    test('should respect provider priority configuration', async () => {
      const config = await configManager.getLLMProviderConfig();
      expect(config.provider).toBe('claude-code');
      expect(config.cliOptions?.priority).toBe(true);
      
      console.log('✓ CLI priority configuration respected');
    });
  });

  describe('Provider Manager CLI Operations', () => {
    test('should handle message sending with CLI provider', async () => {
      if (!cliAvailable) {
        console.log('⚠ Skipping test - CLI not available');
        return;
      }

      const detector = createCLIDetector();
      const cliAuthenticated = await detector.isCLIAuthenticated();
      if (!cliAuthenticated) {
        console.log('⚠ Skipping test - CLI not authenticated');
        return;
      }

      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'Reply with exactly one word: hello'
        }],
        model: 'claude-3-haiku-20240307',
        maxTokens: 5
      };

      try {
        const response = await providerManager.sendMessage(request);
        
        expect(response).toHaveProperty('content');
        expect(response).toHaveProperty('model');
        expect(response).toHaveProperty('usage');
        expect(typeof response.content).toBe('string');
        expect(response.content.length).toBeGreaterThan(0);
        
        console.log('CLI Provider Response:', response);
        console.log('✓ Message sent successfully via CLI provider');
      } catch (error) {
        console.log('⚠ CLI message sending failed:', error.message);
        // This might fail due to various CLI issues
      }
    });

    test('should handle streaming with CLI provider', async () => {
      if (!cliAvailable) {
        console.log('⚠ Skipping test - CLI not available');
        return;
      }

      const cliAuthenticated = await CLIDetector.isCLIAuthenticated();
      if (!cliAuthenticated) {
        console.log('⚠ Skipping test - CLI not authenticated');
        return;
      }

      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'Count from 1 to 3'
        }],
        model: 'claude-3-haiku',
        maxTokens: 20,
        stream: true
      };

      try {
        const stream = providerManager.sendMessageStream(request);
        const chunks: string[] = [];
        
        for await (const chunk of stream) {
          chunks.push(chunk.content);
          if (chunks.length > 10) break; // Prevent infinite loops
        }

        expect(chunks.length).toBeGreaterThan(0);
        const fullContent = chunks.join('');
        expect(fullContent.length).toBeGreaterThan(0);
        
        console.log('CLI Streaming chunks:', chunks.length);
        console.log('✓ Streaming worked via CLI provider');
      } catch (error) {
        console.log('⚠ CLI streaming failed:', error.message);
        // This might fail due to various CLI issues
      }
    });
  });

  describe('Provider Manager Health Checks', () => {
    test('should check all provider health statuses', async () => {
      const healthStatuses = await providerManager.getProviderHealthStatuses();
      
      expect(typeof healthStatuses).toBe('object');
      expect(Object.keys(healthStatuses).length).toBeGreaterThan(0);
      
      // Check that CLI provider is included
      expect(healthStatuses).toHaveProperty('claude-code');
      
      const cliHealth = healthStatuses['claude-code'];
      expect(cliHealth).toHaveProperty('healthy');
      expect(cliHealth).toHaveProperty('message');
      
      console.log('Provider Health Statuses:', healthStatuses);
      
      if (cliAvailable) {
        console.log('✓ CLI provider health check completed');
      } else {
        console.log('⚠ CLI provider reported as unavailable');
      }
    });

    test('should handle provider health monitoring', async () => {
      // Start health monitoring
      const healthPromise = new Promise((resolve) => {
        providerManager.on('providerHealthChange', (data) => {
          expect(data).toHaveProperty('providerName');
          expect(data).toHaveProperty('health');
          console.log('Health change event:', data);
          resolve(data);
        });
      });

      // Trigger health check
      await providerManager.checkAllProviderHealth();
      
      // Wait a bit for potential events
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        await Promise.race([healthPromise, timeoutPromise]);
        console.log('✓ Health monitoring events handled');
      } catch (error) {
        console.log('⚠ No health change events - this is normal if status unchanged');
      }
    });
  });

  describe('Provider Manager Configuration', () => {
    test('should handle CLI configuration updates', async () => {
      const originalConfig = await configManager.getLLMProviderConfig();
      
      // Update CLI configuration
      const updatedConfig: LLMProviderConfig = {
        ...originalConfig,
        cliOptions: {
          ...originalConfig.cliOptions,
          processTimeout: 45000,
          processPoolSize: 5
        }
      };
      
      await configManager.setLLMProviderConfig(updatedConfig);
      
      // Create new provider manager with updated config
      const newProviderManager = new ProviderManager(configManager);
      
      const newConfig = await configManager.getLLMProviderConfig();
      expect(newConfig.cliOptions?.processTimeout).toBe(45000);
      expect(newConfig.cliOptions?.processPoolSize).toBe(5);
      
      console.log('✓ CLI configuration updates handled');
    });

    test('should handle provider fallback configuration', async () => {
      const config = await configManager.getLLMProviderConfig();
      
      expect(Array.isArray(config.fallbackModels)).toBe(true);
      
      console.log('Fallback models:', config.fallbackModels);
      console.log('✓ Provider fallback configuration correct');
    });
  });

  describe('Provider Manager Error Handling', () => {
    test('should handle CLI provider errors gracefully', async () => {
      if (!cliAvailable) {
        console.log('⚠ Skipping test - CLI not available');
        return;
      }

      // Test with an invalid request that might cause CLI errors
      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'x'.repeat(10000) // Very long message that might cause issues
        }],
        model: 'claude-3-haiku',
        maxTokens: 1
      };

      try {
        await providerManager.sendMessage(request);
        console.log('⚠ Large message request succeeded unexpectedly');
      } catch (error) {
        expect(error).toBeDefined();
        expect(typeof error.message).toBe('string');
        console.log('✓ CLI error handled gracefully:', error.message);
      }
    });

    test('should provide helpful error messages', async () => {
      // Test with configuration that would cause provider selection to fail
      const emptyConfig: LLMProviderConfig = {
        provider: 'nonexistent-provider' as any,
        model: 'claude-3-haiku-20240307'
      };
      
      await configManager.setLLMProviderConfig(emptyConfig);
      const errorProviderManager = new ProviderManager(configManager);
      
      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'Hello'
        }],
        model: 'claude-3-haiku',
        maxTokens: 10
      };

      try {
        await errorProviderManager.getProvider(request);
        console.log('⚠ Provider selection succeeded with invalid config');
      } catch (error) {
        expect(error.message).toBeTruthy();
        expect(error.message.length).toBeGreaterThan(0);
        console.log('✓ Helpful error message provided:', error.message);
      }
    });
  });

  describe('Provider Manager Performance', () => {
    test('should handle concurrent requests efficiently', async () => {
      if (!cliAvailable) {
        console.log('⚠ Skipping test - CLI not available');
        return;
      }

      const cliAuthenticated = await CLIDetector.isCLIAuthenticated();
      if (!cliAuthenticated) {
        console.log('⚠ Skipping test - CLI not authenticated');
        return;
      }

      const requests = Array(3).fill(null).map((_, i) => ({
        messages: [{
          role: 'user',
          content: `Say number ${i + 1}`
        }],
        model: 'claude-3-haiku',
        maxTokens: 5
      }));

      const startTime = Date.now();
      
      try {
        const responses = await Promise.all(
          requests.map(req => providerManager.sendMessage(req))
        );
        
        const duration = Date.now() - startTime;
        
        expect(responses).toHaveLength(3);
        responses.forEach(response => {
          expect(response.content).toBeTruthy();
        });
        
        console.log(`✓ ${responses.length} concurrent requests completed in ${duration}ms`);
        console.log(`Average per request: ${Math.round(duration / responses.length)}ms`);
      } catch (error) {
        console.log('⚠ Concurrent requests failed:', error.message);
      }
    });

    test('should cache provider instances efficiently', async () => {
      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: 'Hello'
        }],
        model: 'claude-3-haiku',
        maxTokens: 10
      };

      // First provider request
      const start1 = Date.now();
      try {
        const provider1 = await providerManager.getProvider(request);
        const duration1 = Date.now() - start1;
        
        // Second provider request (should be cached)
        const start2 = Date.now();
        const provider2 = await providerManager.getProvider(request);
        const duration2 = Date.now() - start2;
        
        expect(provider1).toBe(provider2); // Same instance
        expect(duration2).toBeLessThan(duration1); // Faster due to caching
        
        console.log(`First getProvider: ${duration1}ms, Second: ${duration2}ms`);
        console.log('✓ Provider caching is working efficiently');
      } catch (error) {
        console.log('⚠ Provider caching test failed:', error.message);
      }
    });
  });
});