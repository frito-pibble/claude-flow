/**
 * Claude Code CLI Provider Implementation
 * Uses Claude Code CLI subprocess calls instead of direct API access
 * Leverages Pro account authentication and built-in reliability features
 */

import { BaseProvider } from './base-provider.js';
import { ClaudeCodeCLIClient } from '../api/claude-code-cli-client.js';
import {
  LLMProvider,
  LLMModel,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ModelInfo,
  ProviderCapabilities,
  HealthCheckResult,
  LLMProviderError,
  AuthenticationError,
} from './types.js';

export class ClaudeCodeProvider extends BaseProvider {
  readonly name: LLMProvider = 'claude-code';
  readonly capabilities: ProviderCapabilities = {
    supportedModels: [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2',
    ],
    maxContextLength: {
      'claude-3-opus-20240229': 200000,
      'claude-3-sonnet-20240229': 200000,
      'claude-3-haiku-20240307': 200000,
      'claude-2.1': 200000,
      'claude-2.0': 100000,
      'claude-instant-1.2': 100000,
    } as Record<LLMModel, number>,
    maxOutputTokens: {
      'claude-3-opus-20240229': 4096,
      'claude-3-sonnet-20240229': 4096,
      'claude-3-haiku-20240307': 4096,
      'claude-2.1': 4096,
      'claude-2.0': 4096,
      'claude-instant-1.2': 4096,
    } as Record<LLMModel, number>,
    supportsStreaming: true,
    supportsFunctionCalling: false, // Claude doesn't have native function calling yet
    supportsSystemMessages: true,
    supportsVision: true, // Claude 3 models support vision
    supportsAudio: false,
    supportsTools: false,
    supportsFineTuning: false,
    supportsEmbeddings: false,
    supportsLogprobs: false,
    supportsBatching: false,
    // No pricing info for CLI provider - Pro account has no usage costs
    pricing: {
      'claude-3-opus-20240229': {
        promptCostPer1k: 0,
        completionCostPer1k: 0,
        currency: 'USD',
      },
      'claude-3-sonnet-20240229': {
        promptCostPer1k: 0,
        completionCostPer1k: 0,
        currency: 'USD',
      },
      'claude-3-haiku-20240307': {
        promptCostPer1k: 0,
        completionCostPer1k: 0,
        currency: 'USD',
      },
      'claude-2.1': {
        promptCostPer1k: 0,
        completionCostPer1k: 0,
        currency: 'USD',
      },
      'claude-2.0': {
        promptCostPer1k: 0,
        completionCostPer1k: 0,
        currency: 'USD',
      },
      'claude-instant-1.2': {
        promptCostPer1k: 0,
        completionCostPer1k: 0,
        currency: 'USD',
      },
    },
  };

  private cliClient!: ClaudeCodeCLIClient;

  protected async doInitialize(): Promise<void> {
    // Check if Claude CLI is available and authenticated
    this.cliClient = new ClaudeCodeCLIClient(
      this.logger,
      { get: () => this.config } as any, // Mock config manager
      {
        model: this.mapToCliModel(this.config.model),
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        timeout: this.config.timeout,
        retryAttempts: this.config.retryAttempts,
        retryDelay: this.config.retryDelay,
        enableStreaming: this.config.enableStreaming,
        enableHealthCheck: true,
      }
    );

    // Verify CLI authentication
    const isAuthenticated = await this.cliClient.checkAuthentication();
    if (!isAuthenticated) {
      throw new AuthenticationError(
        'Claude Code CLI is not authenticated. Please run "claude auth" to set up your Pro account.',
        'claude-code',
        {
          setupInstructions: [
            '1. Install Claude Code CLI: npm install -g @anthropic/claude-code',
            '2. Authenticate: claude auth',
            '3. Verify: claude doctor',
          ]
        }
      );
    }

    this.logger.info('Claude Code CLI provider initialized successfully', {
      model: this.config.model,
      cliVersion: await this.getCLIVersion(),
      proAccount: true,
      usageCosts: false,
    });
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    // Map request to CLI format
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const conversationMessages = request.messages.filter((m) => m.role !== 'system');

    // Call CLI client using sendMessage method for full response format
    const response = await this.cliClient.sendMessage(conversationMessages, {
      model: request.model ? this.mapToCliModel(request.model) : undefined,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      systemPrompt: systemMessage?.content,
      stream: false,
    }) as any; // ClaudeResponse type

    // Convert CLI response to unified response format
    return {
      id: response.id,
      model: this.mapFromCliModel(response.model),
      provider: 'claude-code',
      content: response.content[0].text,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      cost: {
        promptCost: 0, // Pro account - no usage costs
        completionCost: 0,
        totalCost: 0,
        currency: 'USD',
      },
      finishReason: response.stop_reason === 'end_turn' ? 'stop' : 'length',
      metadata: {
        source: 'claude-code-cli',
        proAccount: true,
        subprocess: true,
      },
    };
  }

  protected async *doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    // Map request to CLI format
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const conversationMessages = request.messages.filter((m) => m.role !== 'system');

    // Get stream from CLI client
    const stream = await this.cliClient.sendMessage(conversationMessages, {
      model: request.model ? this.mapToCliModel(request.model) : undefined,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      systemPrompt: systemMessage?.content,
      stream: true,
    }) as AsyncIterable<any>; // ClaudeStreamEvent type

    let totalTokens = 0;

    // Process stream events
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        yield {
          type: 'content',
          delta: {
            content: event.delta.text,
          },
        };
      } else if (event.type === 'message_delta' && event.usage) {
        totalTokens = event.usage.output_tokens;
      } else if (event.type === 'message_stop') {
        // Estimate prompt tokens (rough approximation)
        const promptTokens = this.estimateTokens(JSON.stringify(request.messages));
        const completionTokens = totalTokens;

        yield {
          type: 'done',
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
          cost: {
            promptCost: 0, // Pro account - no usage costs
            completionCost: 0,
            totalCost: 0,
            currency: 'USD',
          },
        };
      } else if (event.type === 'error') {
        yield {
          type: 'error',
          error: new LLMProviderError(
            event.error?.message || 'Stream error',
            'CLI_STREAM_ERROR',
            'claude-code'
          ),
        };
      }
    }
  }

  async listModels(): Promise<LLMModel[]> {
    return this.capabilities.supportedModels;
  }

  async getModelInfo(model: LLMModel): Promise<ModelInfo> {
    const cliModel = this.mapToCliModel(model);
    
    // Model information based on known Claude models
    const modelInfoMap: Record<string, Partial<ModelInfo>> = {
      'claude-3-opus-20240229': {
        name: 'Claude 3 Opus',
        description: 'Most powerful Claude model for complex tasks',
        supportedFeatures: ['chat', 'completion', 'vision', 'long-context'],
      },
      'claude-3-sonnet-20240229': {
        name: 'Claude 3 Sonnet',
        description: 'Balanced Claude model for general use',
        supportedFeatures: ['chat', 'completion', 'vision', 'long-context'],
      },
      'claude-3-haiku-20240307': {
        name: 'Claude 3 Haiku',
        description: 'Fastest Claude model for simple tasks',
        supportedFeatures: ['chat', 'completion', 'vision', 'long-context'],
      },
      'claude-2.1': {
        name: 'Claude 2.1',
        description: 'Previous generation Claude model',
        supportedFeatures: ['chat', 'completion', 'long-context'],
      },
      'claude-2.0': {
        name: 'Claude 2.0',
        description: 'Previous generation Claude model',
        supportedFeatures: ['chat', 'completion'],
      },
      'claude-instant-1.2': {
        name: 'Claude Instant',
        description: 'Fast Claude model for simple tasks',
        supportedFeatures: ['chat', 'completion'],
      },
    };

    const info = modelInfoMap[model] || {};
    
    return {
      model,
      name: info.name || model,
      description: info.description || `Claude model ${model}`,
      contextLength: this.capabilities.maxContextLength[model] || 200000,
      maxOutputTokens: this.capabilities.maxOutputTokens[model] || 4096,
      supportedFeatures: info.supportedFeatures || ['chat', 'completion'],
      pricing: {
        promptCostPer1k: 0,
        completionCostPer1k: 0,
        currency: 'USD',
      },
    };
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    try {
      // Check CLI authentication first
      const isAuthenticated = await this.cliClient.checkAuthentication();
      if (!isAuthenticated) {
        return {
          healthy: false,
          error: 'Claude Code CLI not authenticated',
          timestamp: new Date(),
          details: {
            authenticated: false,
            setupRequired: true,
          },
        };
      }

      // Perform health check using CLI client
      const healthResult = await this.cliClient.performHealthCheck();
      
      return {
        healthy: healthResult.healthy,
        latency: healthResult.latency,
        error: healthResult.error,
        timestamp: new Date(),
        details: {
          source: 'claude-code-cli',
          authenticated: true,
          proAccount: true,
          processPool: this.cliClient.getProcessPoolStatus(),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
        details: {
          source: 'claude-code-cli',
          cliError: true,
        },
      };
    }
  }

  /**
   * Get CLI version for debugging
   */
  private async getCLIVersion(): Promise<string> {
    try {
      // This would need to be implemented in the CLI client
      // For now, return a placeholder
      return 'claude-code-cli-v1.0.0';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Map unified model to CLI model format
   */
  private mapToCliModel(model: LLMModel): string {
    // Map to CLI-friendly model names
    const modelMap: Record<string, string> = {
      'claude-3-opus-20240229': 'opus',
      'claude-3-sonnet-20240229': 'sonnet',
      'claude-3-haiku-20240307': 'haiku',
      'claude-2.1': 'claude-2.1',
      'claude-2.0': 'claude-2.0',
      'claude-instant-1.2': 'claude-instant',
    };

    return modelMap[model] || model;
  }

  /**
   * Map CLI model back to unified model
   */
  private mapFromCliModel(model: string): LLMModel {
    // Reverse mapping from CLI models
    const reverseMap: Record<string, LLMModel> = {
      'opus': 'claude-3-opus-20240229',
      'sonnet': 'claude-3-sonnet-20240229',
      'haiku': 'claude-3-haiku-20240307',
      'claude-2.1': 'claude-2.1',
      'claude-2.0': 'claude-2.0',
      'claude-instant': 'claude-instant-1.2',
    };

    return reverseMap[model] || (model as LLMModel);
  }

  /**
   * Override validation to not require API key
   */
  protected validateConfig(): void {
    if (!this.config.model) {
      throw new Error(`Model is required for ${this.name} provider`);
    }
    
    if (!this.validateModel(this.config.model)) {
      throw new Error(`Model ${this.config.model} is not supported by ${this.name} provider`);
    }
    
    if (this.config.temperature !== undefined) {
      if (this.config.temperature < 0 || this.config.temperature > 2) {
        throw new Error('Temperature must be between 0 and 2');
      }
    }
    
    if (this.config.maxTokens !== undefined) {
      const maxAllowed = this.capabilities.maxOutputTokens[this.config.model] || 4096;
      if (this.config.maxTokens > maxAllowed) {
        throw new Error(`Max tokens exceeds limit of ${maxAllowed} for model ${this.config.model}`);
      }
    }

    // Note: No API key validation for CLI provider
    // Authentication is handled by the CLI itself
  }

  /**
   * Get CLI-specific status information
   */
  getStatus() {
    const baseStatus = super.getStatus();
    const processStatus = this.cliClient?.getProcessPoolStatus();
    
    return {
      ...baseStatus,
      details: {
        source: 'claude-code-cli',
        proAccount: true,
        usageCosts: false,
        processPool: processStatus,
      },
    };
  }

  destroy(): void {
    super.destroy();
    this.cliClient?.destroy();
  }
}