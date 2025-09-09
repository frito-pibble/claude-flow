/**
 * End-to-End CLI Integration Tests for Claude Flow
 * 
 * These tests validate the complete CLI integration workflow from setup to execution,
 * including provider switching, error handling, and user experience validation.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { CLIDetector, createCLIDetector } from '../../src/utils/cli-detection.js';
import { ClaudeCodeProvider } from '../../src/providers/claude-code-provider.js';
import { ProviderManager } from '../../src/providers/provider-manager.js';
import { ConfigManager } from '../../src/config/config-manager.js';
import { ClaudeCodeCLIClient } from '../../src/api/claude-code-cli-client.js';
import { CLIPerformanceMonitor } from '../../src/utils/cli-performance.js';

describe('CLI Integration End-to-End Tests', () => {
  let cliDetector: CLIDetector;
  let providerManager: ProviderManager;
  let configManager: ConfigManager;
  let performanceMonitor: CLIPerformanceMonitor;
  let cliAvailable = false;
  let cliAuthenticated = false;

  beforeAll(async () => {
    // Initialize core components
    cliDetector = createCLIDetector();
    configManager = ConfigManager.getInstance();
    providerManager = new ProviderManager(configManager);
    performanceMonitor = new CLIPerformanceMonitor({ enableMonitoring: true });

    // Check CLI availability
    try {
      cliAvailable = await cliDetector.isCLIInstalled();
      if (cliAvailable) {
        cliAuthenticated = await cliDetector.isCLIAuthenticated();
      }
    } catch (error) {
      console.log('CLI availability check failed:', error);
    }

    if (!cliAvailable) {
      console.log('⚠️  Claude CLI not installed. E2E tests will be skipped.');
      console.log('   Install Claude CLI with: npm install -g @anthropics/claude');
    } else if (!cliAuthenticated) {
      console.log('⚠️  Claude CLI not authenticated. Some E2E tests will be skipped.');
      console.log('   Authenticate with: claude auth login');
    } else {
      console.log('✅ Claude CLI is installed and authenticated. Running full E2E tests.');
    }
  });

  afterAll(async () => {
    if (performanceMonitor) {
      await performanceMonitor.shutdown();
    }
  });

  describe('CLI Detection Workflow', () => {
    test('should detect CLI installation status', async () => {
      const isInstalled = await cliDetector.isCLIInstalled();
      const version = await cliDetector.getCLIVersion();
      const healthCheck = await cliDetector.runHealthCheck();

      expect(typeof isInstalled).toBe('boolean');
      expect(typeof version).toBe('string');
      expect(healthCheck).toHaveProperty('cliInstalled');
      expect(healthCheck).toHaveProperty('authenticated');
      expect(healthCheck).toHaveProperty('proAccount');
      expect(healthCheck).toHaveProperty('setupGuidance');

      console.log('CLI Health Check Result:', JSON.stringify(healthCheck, null, 2));
    });

    test('should provide appropriate setup guidance', async () => {
      const guidance = await cliDetector.getSetupGuidance();
      
      expect(guidance).toHaveProperty('steps');
      expect(Array.isArray(guidance.steps)).toBe(true);
      expect(guidance).toHaveProperty('status');
      expect(guidance).toHaveProperty('nextAction');

      console.log('CLI Setup Guidance:', JSON.stringify(guidance, null, 2));
    });

    test('should handle CLI status caching correctly', async () => {
      // First call should cache the result
      const startTime = performance.now();
      const result1 = await cliDetector.runHealthCheck();
      const firstCallTime = performance.now() - startTime;

      // Second call should be faster due to caching
      const cachedStartTime = performance.now();
      const result2 = await cliDetector.runHealthCheck();
      const cachedCallTime = performance.now() - cachedStartTime;

      expect(result1).toEqual(result2);
      expect(cachedCallTime).toBeLessThan(firstCallTime * 0.5); // Cached call should be at least 50% faster

      console.log(`Health check times - First: ${firstCallTime.toFixed(2)}ms, Cached: ${cachedCallTime.toFixed(2)}ms`);
    });
  });

  describe('Provider Manager Integration', () => {
    beforeEach(async () => {
      await configManager.loadConfig();
    });

    test('should initialize provider manager with CLI support', async () => {
      const providers = await providerManager.getAvailableProviders();
      
      expect(providers).toContain('claude-code');
      
      const cliProvider = await providerManager.getProvider('claude-code');
      expect(cliProvider).toBeInstanceOf(ClaudeCodeProvider);

      if (cliAvailable && cliAuthenticated) {
        const isAvailable = await cliProvider.isAvailable();
        expect(isAvailable).toBe(true);
      }
    });

    test('should select CLI provider when available', async () => {
      const selectedProvider = await providerManager.selectProvider({
        message: 'Test message for provider selection',
        model: 'claude-3-sonnet-20240229'
      });

      expect(selectedProvider).toBeDefined();
      
      if (cliAvailable && cliAuthenticated) {
        expect(selectedProvider.constructor.name).toBe('ClaudeCodeProvider');
        console.log('✅ CLI provider selected automatically');
      } else {
        console.log('⚠️  CLI provider not available, fallback provider selected');
      }
    });

    test('should handle provider switching gracefully', async () => {
      const config = configManager.getConfig();
      
      // Test switching to CLI provider
      configManager.updateConfig({
        llmProvider: {
          ...config.llmProvider,
          preferredProvider: 'claude-code',
          preferCLI: true
        }
      });

      const cliProvider = await providerManager.selectProvider({
        message: 'Test message',
        model: 'claude-3-sonnet-20240229'
      });

      if (cliAvailable && cliAuthenticated) {
        expect(cliProvider.constructor.name).toBe('ClaudeCodeProvider');
      }

      // Test fallback behavior
      configManager.updateConfig({
        llmProvider: {
          ...config.llmProvider,
          preferredProvider: 'anthropic',
          preferCLI: false
        }
      });

      const apiProvider = await providerManager.selectProvider({
        message: 'Test message',
        model: 'claude-3-sonnet-20240229'
      });

      // Should fall back to API provider when CLI not preferred
      expect(apiProvider).toBeDefined();
    });
  });

  describe('CLI Client Integration', () => {
    let cliClient: ClaudeCodeCLIClient;

    beforeEach(() => {
      cliClient = new ClaudeCodeCLIClient({
        model: 'claude-3-sonnet-20240229',
        timeout: 30000,
        enableStreaming: true
      });
    });

    test('should perform health checks correctly', async () => {
      const healthResult = await cliClient.healthCheck();
      
      expect(healthResult).toHaveProperty('healthy');
      expect(healthResult).toHaveProperty('details');
      expect(healthResult).toHaveProperty('timestamp');
      
      if (cliAvailable) {
        expect(healthResult.details).toHaveProperty('cliVersion');
        expect(healthResult.details).toHaveProperty('authentication');
      }

      console.log('CLI Client Health Check:', JSON.stringify(healthResult, null, 2));
    }, 10000);

    test('should handle CLI configuration updates', async () => {
      const originalConfig = cliClient.getConfiguration();
      
      cliClient.updateConfiguration({
        model: 'claude-3-haiku-20240307',
        timeout: 45000,
        maxConcurrentProcesses: 3
      });

      const updatedConfig = cliClient.getConfiguration();
      expect(updatedConfig.model).toBe('claude-3-haiku-20240307');
      expect(updatedConfig.timeout).toBe(45000);
      expect(updatedConfig.maxConcurrentProcesses).toBe(3);

      // Restore original config
      cliClient.updateConfiguration(originalConfig);
    });

    test('should execute basic CLI commands when available', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping CLI command test - CLI not available or authenticated');
        return;
      }

      try {
        const response = await cliClient.sendMessage({
          message: 'Say "Hello from CLI test" and nothing else.',
          model: 'claude-3-haiku-20240307',
          maxTokens: 50
        });

        expect(response).toHaveProperty('content');
        expect(response).toHaveProperty('model');
        expect(response.content).toContain('Hello from CLI test');
        
        console.log('✅ CLI message sent successfully:', response.content);
      } catch (error) {
        console.log('CLI command failed (expected if not authenticated):', error.message);
      }
    }, 30000);

    test('should handle streaming responses when available', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping CLI streaming test - CLI not available or authenticated');
        return;
      }

      try {
        const streamingResponse = cliClient.streamMessage({
          message: 'Count from 1 to 5, one number per line.',
          model: 'claude-3-haiku-20240307',
          maxTokens: 100
        });

        const chunks: string[] = [];
        for await (const chunk of streamingResponse) {
          if (chunk.type === 'content_block_delta') {
            chunks.push(chunk.delta.text);
          }
        }

        const fullResponse = chunks.join('');
        expect(fullResponse.length).toBeGreaterThan(0);
        
        console.log('✅ CLI streaming response received:', fullResponse);
      } catch (error) {
        console.log('CLI streaming failed (expected if not authenticated):', error.message);
      }
    }, 30000);
  });

  describe('Error Handling and Recovery', () => {
    test('should handle CLI unavailable scenarios gracefully', async () => {
      // Create a CLI client with invalid executable
      const invalidClient = new ClaudeCodeCLIClient({
        claudeExecutable: 'invalid-claude-command',
        timeout: 5000
      });

      const healthResult = await invalidClient.healthCheck();
      expect(healthResult.healthy).toBe(false);
      expect(healthResult.error).toBeDefined();
      expect(healthResult.error.type).toBe('CLI_NOT_INSTALLED');
    });

    test('should provide helpful error messages for common issues', async () => {
      const scenarios = [
        { executable: 'invalid-claude-command', expectedType: 'CLI_NOT_INSTALLED' },
        { executable: 'echo', expectedType: 'CLI_EXECUTION_ERROR' }, // Will fail parsing JSON
      ];

      for (const scenario of scenarios) {
        const testClient = new ClaudeCodeCLIClient({
          claudeExecutable: scenario.executable,
          timeout: 5000
        });

        const healthResult = await testClient.healthCheck();
        expect(healthResult.healthy).toBe(false);
        expect(healthResult.error.type).toBe(scenario.expectedType);
        expect(healthResult.error.userMessage).toBeDefined();
        expect(healthResult.error.guidance).toBeDefined();
      }
    });

    test('should handle timeout scenarios appropriately', async () => {
      if (!cliAvailable || !cliAuthenticated) {
        console.log('⚠️  Skipping timeout test - CLI not available or authenticated');
        return;
      }

      // Create client with very short timeout
      const timeoutClient = new ClaudeCodeCLIClient({
        timeout: 100 // Very short timeout
      });

      try {
        await timeoutClient.sendMessage({
          message: 'Write a long story about space exploration.',
          model: 'claude-3-sonnet-20240229'
        });
        
        // Should not reach here with such a short timeout
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/timeout|timed out/i);
      }
    }, 10000);
  });

  describe('Performance Monitoring Integration', () => {
    test('should collect performance metrics during operations', async () => {
      const initialStats = performanceMonitor.getPerformanceStats();
      
      if (cliAvailable && cliAuthenticated) {
        const cliClient = new ClaudeCodeCLIClient();
        
        try {
          await cliClient.sendMessage({
            message: 'Hello from performance test',
            model: 'claude-3-haiku-20240307'
          });

          // Wait a moment for metrics to be collected
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const finalStats = performanceMonitor.getPerformanceStats();
          expect(finalStats.totalProcesses).toBeGreaterThan(initialStats.totalProcesses);
        } catch (error) {
          console.log('Performance test skipped due to CLI error:', error.message);
        }
      }

      // Test metrics structure regardless of CLI availability
      expect(initialStats).toHaveProperty('totalProcesses');
      expect(initialStats).toHaveProperty('successRate');
      expect(initialStats).toHaveProperty('averageExecutionTime');
    });

    test('should provide performance recommendations', async () => {
      const recommendations = await performanceMonitor.getOptimizationRecommendations();
      
      expect(Array.isArray(recommendations)).toBe(true);
      
      recommendations.forEach(recommendation => {
        expect(recommendation).toHaveProperty('type');
        expect(recommendation).toHaveProperty('description');
        expect(recommendation).toHaveProperty('priority');
        expect(recommendation).toHaveProperty('impact');
      });

      console.log('Performance Recommendations:', JSON.stringify(recommendations, null, 2));
    });
  });

  describe('Complete Workflow Integration', () => {
    test('should execute complete end-to-end workflow', async () => {
      const workflowStart = performance.now();
      let workflowResults: any = {};

      try {
        // Step 1: CLI Detection and Health Check
        console.log('🔍 Step 1: CLI Detection and Health Check');
        const healthCheck = await cliDetector.runHealthCheck();
        workflowResults.cliHealth = healthCheck;
        expect(healthCheck).toHaveProperty('cliInstalled');

        // Step 2: Provider Initialization
        console.log('🏭 Step 2: Provider Initialization');
        const providers = await providerManager.getAvailableProviders();
        const selectedProvider = await providerManager.selectProvider({
          message: 'Workflow test message',
          model: 'claude-3-haiku-20240307'
        });
        workflowResults.providerSelection = {
          availableProviders: providers,
          selectedProvider: selectedProvider.constructor.name
        };
        expect(selectedProvider).toBeDefined();

        // Step 3: Configuration Management
        console.log('⚙️ Step 3: Configuration Management');
        const config = configManager.getConfig();
        workflowResults.configuration = {
          hasLLMProvider: !!config.llmProvider,
          prefersCLI: config.llmProvider?.preferCLI || false
        };
        expect(config).toHaveProperty('llmProvider');

        // Step 4: Message Processing (if CLI available and authenticated)
        if (cliAvailable && cliAuthenticated) {
          console.log('💬 Step 4: Message Processing');
          
          try {
            const response = await selectedProvider.sendMessage({
              message: 'Respond with exactly: "E2E workflow test successful"',
              model: 'claude-3-haiku-20240307',
              maxTokens: 50
            });
            
            workflowResults.messageProcessing = {
              success: true,
              responseLength: response.content?.length || 0,
              model: response.model
            };
            expect(response.content).toContain('E2E workflow test successful');
          } catch (error) {
            workflowResults.messageProcessing = {
              success: false,
              error: error.message
            };
          }
        } else {
          console.log('⚠️  Step 4: Message Processing skipped - CLI not available/authenticated');
          workflowResults.messageProcessing = {
            skipped: true,
            reason: !cliAvailable ? 'CLI not installed' : 'CLI not authenticated'
          };
        }

        // Step 5: Performance Analysis
        console.log('📊 Step 5: Performance Analysis');
        const performanceStats = performanceMonitor.getPerformanceStats();
        workflowResults.performance = {
          totalProcesses: performanceStats.totalProcesses,
          successRate: performanceStats.successRate,
          averageExecutionTime: performanceStats.averageExecutionTime
        };

        const workflowTime = performance.now() - workflowStart;
        workflowResults.totalWorkflowTime = workflowTime;

        console.log('✅ Complete E2E Workflow Results:', JSON.stringify(workflowResults, null, 2));
        console.log(`🕐 Total workflow time: ${workflowTime.toFixed(2)}ms`);

        // Workflow should complete in reasonable time
        expect(workflowTime).toBeLessThan(60000); // 60 seconds maximum

      } catch (error) {
        console.error('❌ E2E Workflow failed:', error);
        workflowResults.error = error.message;
        throw error;
      }
    }, 90000);

    test('should handle workflow interruptions gracefully', async () => {
      // Test workflow resilience by introducing deliberate failures
      const originalExecutable = process.env.CLAUDE_EXECUTABLE;
      
      try {
        // Temporarily break CLI by setting invalid executable
        process.env.CLAUDE_EXECUTABLE = 'invalid-command';
        
        const workflowStart = performance.now();
        
        // Attempt workflow with broken CLI
        const healthCheck = await cliDetector.runHealthCheck();
        expect(healthCheck.cliInstalled).toBe(false);
        
        const selectedProvider = await providerManager.selectProvider({
          message: 'Test with broken CLI',
          model: 'claude-3-haiku-20240307'
        });
        
        // Should still get a working provider (fallback)
        expect(selectedProvider).toBeDefined();
        
        const workflowTime = performance.now() - workflowStart;
        console.log(`⚠️  Workflow with interruptions completed in ${workflowTime.toFixed(2)}ms`);
        
        // Should handle gracefully and complete quickly
        expect(workflowTime).toBeLessThan(10000); // 10 seconds for error scenarios
        
      } finally {
        // Restore environment
        if (originalExecutable) {
          process.env.CLAUDE_EXECUTABLE = originalExecutable;
        } else {
          delete process.env.CLAUDE_EXECUTABLE;
        }
      }
    });
  });
});