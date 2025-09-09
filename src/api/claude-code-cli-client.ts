/**
 * Claude Code CLI Client for Claude-Flow
 * Provides integration with Claude Code CLI using subprocess calls
 * Replaces direct API usage with CLI subprocess management
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { ILogger } from '../core/logger.js';
import { ConfigManager } from '../config/config-manager.js';
import { generateId } from '../utils/helpers.js';
import {
  ClaudeAPIError,
  ClaudeInternalServerError,
  ClaudeServiceUnavailableError,
  ClaudeRateLimitError,
  ClaudeTimeoutError,
  ClaudeNetworkError,
  ClaudeAuthenticationError,
  ClaudeValidationError,
  HealthCheckResult,
} from './claude-api-errors.js';
import {
  CLIErrorHandler,
} from '../utils/cli-error-handling.js';

// Re-export types from claude-client.ts for compatibility
export type {
  ClaudeModel,
  ClaudeMessage,
  ClaudeRequest,
  ClaudeResponse,
  ClaudeStreamEvent,
} from './claude-client.js';

// Import the types for local use
import type {
  ClaudeResponse,
  ClaudeStreamEvent,
} from './claude-client.js';

export interface ClaudeCodeCLIConfig {
  claudeExecutable?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  maxConcurrentProcesses?: number;
  processPooling?: boolean;
  enableStreaming?: boolean;
  workingDirectory?: string;
  environmentVariables?: Record<string, string>;
  
  // Authentication and health check options
  enableHealthCheck?: boolean;
  healthCheckInterval?: number;
  
  // Retry configuration
  retryAttempts?: number;
  retryDelay?: number;
  retryJitter?: boolean;
}

export interface CLIResponse {
  content: string;
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  stop_reason?: string;
  id?: string;
  type?: string;
  role?: string;
  error?: {
    type: string;
    message: string;
  };
}

export interface CLIStreamEvent {
  type: string;
  content?: string;
  delta?: {
    text?: string;
    type?: 'text_delta';
    stop_reason?: string;
    stop_sequence?: string;
  };
  usage?: {
    output_tokens: number;
    input_tokens?: number;
  };
  message?: {
    id?: string;
    model?: string;
    role?: string;
    content?: Array<{
      type: 'text';
      text: string;
    }>;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  content_block?: {
    type: 'text';
    text: string;
  };
  index?: number;
  error?: {
    type: string;
    message: string;
  };
}

export interface CLIProcessInfo {
  id: string;
  process: ChildProcess;
  command: string;
  startTime: Date;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  inUse: boolean;
}

export class ClaudeCodeCLIClient extends EventEmitter {
  private config: ClaudeCodeCLIConfig;
  private logger: ILogger;
  private configManager: ConfigManager;
  private processPool: Map<string, CLIProcessInfo> = new Map();
  private lastHealthCheck?: HealthCheckResult;
  private healthCheckTimer?: NodeJS.Timeout;
  private requestCount = 0;
  private errorCount = 0;

  constructor(
    logger: ILogger,
    configManager: ConfigManager,
    config?: Partial<ClaudeCodeCLIConfig>
  ) {
    super();
    this.logger = logger;
    this.configManager = configManager;
    this.config = this.loadConfiguration(config);

    // Start health check if enabled
    if (this.config.enableHealthCheck) {
      this.startHealthCheck();
    }

    // Cleanup processes on exit
    const nodeProcess = process;
    nodeProcess.on('exit', () => this.cleanup());
    nodeProcess.on('SIGINT', () => this.cleanup());
    nodeProcess.on('SIGTERM', () => this.cleanup());
  }

  /**
   * Load configuration from various sources
   */
  private loadConfiguration(overrides?: Partial<ClaudeCodeCLIConfig>): ClaudeCodeCLIConfig {
    const config: ClaudeCodeCLIConfig = {
      claudeExecutable: 'claude',
      model: 'sonnet',
      temperature: 0.7,
      maxTokens: 4096,
      timeout: 60000, // 60 seconds
      maxConcurrentProcesses: 5,
      processPooling: true,
      enableStreaming: true,
      workingDirectory: process.cwd(),
      environmentVariables: {},
      
      // Health check defaults
      enableHealthCheck: false,
      healthCheckInterval: 300000, // 5 minutes
      
      // Retry defaults
      retryAttempts: 3,
      retryDelay: 1000,
      retryJitter: true,
    };

    // Load from environment variables
    if (process.env.CLAUDE_EXECUTABLE) {
      config.claudeExecutable = process.env.CLAUDE_EXECUTABLE;
    }
    if (process.env.CLAUDE_MODEL) {
      config.model = process.env.CLAUDE_MODEL;
    }
    if (process.env.CLAUDE_TEMPERATURE) {
      config.temperature = parseFloat(process.env.CLAUDE_TEMPERATURE);
    }
    if (process.env.CLAUDE_MAX_TOKENS) {
      config.maxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS, 10);
    }

    // Load from config manager
    const claudeConfig = this.configManager.get('claude-code');
    if (claudeConfig) {
      Object.assign(config, claudeConfig);
    }

    // Apply overrides
    if (overrides) {
      Object.assign(config, overrides);
    }

    this.validateConfiguration(config);
    return config;
  }

  /**
   * Validate configuration settings
   */
  private validateConfiguration(config: ClaudeCodeCLIConfig): void {
    if (!config.claudeExecutable) {
      throw new ClaudeValidationError('Claude executable path is required');
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      throw new ClaudeValidationError('Temperature must be between 0 and 2');
    }

    if (config.maxTokens !== undefined && (config.maxTokens < 1 || config.maxTokens > 200000)) {
      throw new ClaudeValidationError('Max tokens must be between 1 and 200000');
    }

    if (config.timeout !== undefined && config.timeout < 1000) {
      throw new ClaudeValidationError('Timeout must be at least 1000ms');
    }
  }

  /**
   * Execute a basic completion using Claude CLI
   */
  async complete(
    prompt: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): Promise<string> {
    const response = await this.executeCommand(prompt, {
      ...options,
      stream: false,
    });

    if ('error' in response) {
      throw this.createErrorFromCLIResponse(response);
    }

    return response.content;
  }

  /**
   * Execute a completion and return full ClaudeResponse format
   */
  async sendMessage(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
      stream?: boolean;
    }
  ): Promise<ClaudeResponse | AsyncIterable<ClaudeStreamEvent>> {
    // Convert messages to prompt format
    const prompt = this.convertMessagesToPrompt(messages, options?.systemPrompt);
    
    if (options?.stream) {
      return this.streamMessagesAsClaudeEvents(messages, options);
    } else {
      const response = await this.executeCommand(prompt, {
        ...options,
        stream: false,
      });

      if ('error' in response) {
        throw this.createErrorFromCLIResponse(response);
      }

      return this.convertCLIResponseToClaudeResponse(response, options?.model || this.config.model!);
    }
  }

  /**
   * Execute a streaming completion using Claude CLI
   */
  async *streamComplete(
    prompt: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): AsyncIterable<string> {
    const stream = this.executeStreamingCommand(prompt, options);
    
    for await (const event of stream) {
      if (event.type === 'content' && event.content) {
        yield event.content;
      } else if (event.type === 'delta' && event.delta?.text) {
        yield event.delta.text;
      } else if (event.error) {
        throw this.createErrorFromCLIEvent(event);
      }
    }
  }

  /**
   * Stream messages and convert to ClaudeStreamEvent format
   */
  async *streamMessagesAsClaudeEvents(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): AsyncIterable<ClaudeStreamEvent> {
    const prompt = this.convertMessagesToPrompt(messages, options?.systemPrompt);
    const stream = this.executeStreamingCommand(prompt, options);
    
    let messageId = generateId('msg');
    let model = options?.model || this.config.model || 'sonnet';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let hasStarted = false;

    for await (const event of stream) {
      // Emit message_start only once
      if (!hasStarted) {
        hasStarted = true;
        yield {
          type: 'message_start',
          message: {
            id: messageId,
            type: 'message',
            role: 'assistant',
            content: [],
            model: model,
            stop_reason: 'end_turn',
            stop_sequence: undefined,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        } as ClaudeStreamEvent;

        yield {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'text',
            text: '',
          },
        } as ClaudeStreamEvent;
      }

      if (event.type === 'content' && event.content) {
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: event.content,
          },
        } as ClaudeStreamEvent;
      } else if (event.type === 'delta' && event.delta?.text) {
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: event.delta.text,
          },
        } as ClaudeStreamEvent;
      } else if (event.type === 'content_block_delta' && event.delta?.text) {
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: event.delta.text,
          },
        } as ClaudeStreamEvent;
      } else if (event.usage) {
        totalInputTokens = event.usage.input_tokens || totalInputTokens;
        totalOutputTokens = event.usage.output_tokens || totalOutputTokens;
      } else if (event.error) {
        yield {
          type: 'error',
          error: {
            type: event.error.type,
            message: event.error.message,
          },
        } as ClaudeStreamEvent;
        throw this.createErrorFromCLIEvent(event);
      }
    }

    // Emit final events
    yield {
      type: 'content_block_stop',
      index: 0,
    } as ClaudeStreamEvent;

    yield {
      type: 'message_delta',
      delta: {
        stop_reason: 'end_turn',
        stop_sequence: undefined,
      },
      usage: {
        output_tokens: totalOutputTokens,
      },
    } as ClaudeStreamEvent;

    yield {
      type: 'message_stop',
    } as ClaudeStreamEvent;
  }

  /**
   * Execute a Claude CLI command
   */
  private async executeCommand(
    prompt: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
      stream?: boolean;
    }
  ): Promise<CLIResponse> {
    const args = this.buildCommandArgs(prompt, options);
    
    let lastError: ClaudeAPIError | undefined;

    // Retry logic
    for (let attempt = 0; attempt < (this.config.retryAttempts || 3); attempt++) {
      try {
        const result = await this.spawnCLIProcess(args);
        
        this.requestCount++;
        this.logger.debug('Claude CLI command executed successfully', {
          attempt: attempt + 1,
          model: options?.model || this.config.model,
        });
        
        return result;
      } catch (error) {
        lastError = this.transformError(error);
        this.errorCount++;
        
        if (!lastError.retryable || attempt === (this.config.retryAttempts || 3) - 1) {
          break;
        }

        this.logger.warn(`Claude CLI command failed (attempt ${attempt + 1}/${this.config.retryAttempts})`, {
          error: lastError.message,
          retryable: lastError.retryable,
        });

        if (attempt < (this.config.retryAttempts || 3) - 1) {
          const delay = this.calculateRetryDelay(attempt);
          await this.delay(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute a streaming Claude CLI command
   */
  private async *executeStreamingCommand(
    prompt: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): AsyncIterable<CLIStreamEvent> {
    const args = this.buildCommandArgs(prompt, { ...options, stream: true });
    const processInfo = await this.spawnStreamingProcess(args);
    
    try {
      let buffer = '';
      
      // Process stream events with better error handling and backpressure
      for await (const chunk of this.readProcessOutput(processInfo)) {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line) as CLIStreamEvent;
              
              // Add rate limiting for backpressure
              if (this.processPool.size > (this.config.maxConcurrentProcesses || 5)) {
                await this.delay(10); // Small delay to handle backpressure
              }
              
              yield event;
            } catch (parseError) {
              this.logger.warn('Failed to parse streaming JSON', { 
                line: line.substring(0, 100), // Truncate for logging
                error: parseError instanceof Error ? parseError.message : 'Unknown parse error'
              });
              // Continue processing other lines instead of failing
            }
          }
        }
      }
      
      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer) as CLIStreamEvent;
          yield event;
        } catch (parseError) {
          this.logger.warn('Failed to parse final JSON chunk', { buffer, error: parseError });
        }
      }
    } finally {
      this.cleanupProcess(processInfo);
    }
  }

  /**
   * Build command line arguments for Claude CLI
   */
  private buildCommandArgs(
    prompt: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
      stream?: boolean;
    }
  ): string[] {
    const args = ['-p'];
    
    // Set output format
    if (options?.stream) {
      args.push('--output-format', 'stream-json');
    } else {
      args.push('--output-format', 'json');
    }
    
    // Set model
    const model = options?.model || this.config.model;
    if (model) {
      args.push('--model', model);
    }
    
    // Set system prompt
    if (options?.systemPrompt) {
      args.push('--append-system-prompt', options.systemPrompt);
    }
    
    // Note: temperature and maxTokens are not directly supported by Claude CLI
    // These limitations are documented in the CLI integration docs
    if (options?.temperature !== undefined && options.temperature !== this.config.temperature) {
      this.logger.warn('Temperature parameter not directly supported by Claude CLI, using default');
    }
    
    if (options?.maxTokens !== undefined && options.maxTokens !== this.config.maxTokens) {
      this.logger.warn('MaxTokens parameter not directly supported by Claude CLI, using default');
    }
    
    // Add the actual prompt
    args.push(prompt);
    
    return args;
  }

  /**
   * Spawn a CLI process and wait for completion
   */
  private async spawnCLIProcess(args: string[]): Promise<CLIResponse> {
    const processId = generateId('cli');
    const nodeProcess = process;
    
    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.config.claudeExecutable!, args, {
        cwd: this.config.workingDirectory,
        env: {
          ...nodeProcess.env,
          ...this.config.environmentVariables,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const processInfo: CLIProcessInfo = {
        id: processId,
        process: childProcess,
        command: `${this.config.claudeExecutable} ${args.join(' ')}`,
        startTime: new Date(),
        status: 'running',
        inUse: true,
      };

      this.processPool.set(processId, processInfo);

      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout | undefined;

      // Set up timeout
      if (this.config.timeout) {
        timeoutId = setTimeout(() => {
          processInfo.status = 'timeout';
          childProcess.kill('SIGTERM');
          this.cleanupProcess(processInfo);
          reject(new ClaudeTimeoutError('CLI process timed out', this.config.timeout!));
        }, this.config.timeout);
      }

      // Collect stdout
      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // Collect stderr
      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      childProcess.on('close', (code, signal) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        this.cleanupProcess(processInfo);

        if (signal === 'SIGTERM' && processInfo.status === 'timeout') {
          return; // Timeout already handled
        }

        if (code === 0) {
          processInfo.status = 'completed';
          try {
            const response = JSON.parse(stdout) as CLIResponse;
            resolve(response);
          } catch (parseError) {
            processInfo.status = 'failed';
            reject(new ClaudeAPIError(`Failed to parse CLI response: ${parseError}`, undefined, true));
          }
        } else {
          processInfo.status = 'failed';
          
          // Try to parse error from stderr
          let errorResponse: CLIResponse;
          try {
            errorResponse = JSON.parse(stderr);
          } catch {
            errorResponse = {
              content: '',
              error: {
                type: 'CLI_ERROR',
                message: stderr || `CLI process exited with code ${code}`,
              },
            };
          }
          
          // Enhanced error handling for CLI subprocess errors
          const cliError = CLIErrorHandler.mapSubprocessError(
            new Error(stderr || `CLI process exited with code ${code}`),
            code || undefined,
            stderr,
            'CLI completion request'
          );
          reject(cliError);
        }
      });

      // Handle process errors
      childProcess.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        processInfo.status = 'failed';
        this.cleanupProcess(processInfo);
        // Map subprocess errors to CLI-specific errors with user guidance
        const cliError = CLIErrorHandler.mapSubprocessError(error, undefined, undefined, 'spawn CLI process');
        reject(cliError);
      });
    });
  }

  /**
   * Spawn a streaming CLI process
   */
  private async spawnStreamingProcess(args: string[]): Promise<CLIProcessInfo> {
    const processId = generateId('cli-stream');
    const nodeProcess = process;
    
    const childProcess = spawn(this.config.claudeExecutable!, args, {
      cwd: this.config.workingDirectory,
      env: {
        ...nodeProcess.env,
        ...this.config.environmentVariables,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const processInfo: CLIProcessInfo = {
      id: processId,
      process: childProcess,
      command: `${this.config.claudeExecutable} ${args.join(' ')}`,
      startTime: new Date(),
      status: 'running',
      inUse: true,
    };

    this.processPool.set(processId, processInfo);
    return processInfo;
  }

  /**
   * Read output from a streaming process
   */
  private async *readProcessOutput(processInfo: CLIProcessInfo): AsyncIterable<string> {
    const { process } = processInfo;
    
    if (!process.stdout) {
      throw new ClaudeAPIError('Process stdout is not available');
    }

    // Set up timeout
    let timeoutId: NodeJS.Timeout | undefined;
    if (this.config.timeout) {
      timeoutId = setTimeout(() => {
        processInfo.status = 'timeout';
        process.kill('SIGTERM');
      }, this.config.timeout);
    }

    try {
      process.stdout.setEncoding('utf8');
      
      for await (const chunk of process.stdout) {
        if (processInfo.status !== 'running') {
          break;
        }
        yield chunk as string;
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    // Check if process ended with error
    const exitCode = await new Promise<number | null>((resolve) => {
      if (process.exitCode !== null) {
        resolve(process.exitCode);
      } else {
        process.on('close', resolve);
      }
    });

    if (exitCode !== 0) {
      processInfo.status = 'failed';
      throw new ClaudeAPIError(`Streaming process exited with code ${exitCode}`);
    }

    processInfo.status = 'completed';
  }

  /**
   * Check CLI authentication status
   */
  async checkAuthentication(): Promise<boolean> {
    try {
      const result = await this.spawnCLIProcess(['doctor']);
      
      // Parse doctor output to check authentication
      if (result.error) {
        return false;
      }
      
      // Assuming successful doctor command means authenticated
      return true;
    } catch (error) {
      this.logger.debug('Authentication check failed', { error });
      return false;
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Try a simple completion
      await this.complete('Hi', { maxTokens: 1 });
      
      const latency = Date.now() - startTime;
      
      this.lastHealthCheck = {
        healthy: true,
        latency,
        timestamp: new Date(),
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      
      this.lastHealthCheck = {
        healthy: false,
        latency,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }

    this.emit('health_check', this.lastHealthCheck);
    return this.lastHealthCheck;
  }

  /**
   * Get health status
   */
  getHealthStatus(): HealthCheckResult | undefined {
    return this.lastHealthCheck;
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    this.performHealthCheck(); // Initial check
    
    this.healthCheckTimer = setInterval(
      () => this.performHealthCheck(),
      this.config.healthCheckInterval || 300000
    );
  }

  /**
   * Clean up a specific process
   */
  private cleanupProcess(processInfo: CLIProcessInfo): void {
    processInfo.inUse = false;
    
    if (processInfo.process && !processInfo.process.killed) {
      processInfo.process.kill('SIGTERM');
    }
    
    this.processPool.delete(processInfo.id);
  }

  /**
   * Clean up all resources
   */
  private cleanup(): void {
    // Clear health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    // Kill all active processes
    const processValues = Array.from(this.processPool.values());
    for (const processInfo of processValues) {
      this.cleanupProcess(processInfo);
    }

    this.processPool.clear();
    this.removeAllListeners();
  }

  /**
   * Create error from CLI response with enhanced error mapping
   */
  private createErrorFromCLIResponse(response: CLIResponse): ClaudeAPIError {
    if (!response.error) {
      return new ClaudeAPIError('Unknown CLI error');
    }

    const { type, message } = response.error;
    
    // Map CLI-specific errors to enhanced CLI error types
    switch (type) {
      case 'authentication_error':
        return new ClaudeAuthenticationError(message);
      case 'rate_limit_error':
        return new ClaudeRateLimitError(message);
      case 'timeout_error':
        return new ClaudeTimeoutError(message, this.config.timeout || 60000);
      case 'network_error':
        return new ClaudeNetworkError(message);
      case 'validation_error':
        return new ClaudeValidationError(message);
      case 'permission_error':
        return new ClaudeValidationError(`Permission error: ${message}`);
      case 'internal_error':
        return new ClaudeInternalServerError(message);
      case 'service_unavailable':
        return new ClaudeServiceUnavailableError(message);
      default:
        return new ClaudeAPIError(message, undefined, true);
    }
  }

  /**
   * Create error from CLI stream event
   */
  private createErrorFromCLIEvent(event: CLIStreamEvent): ClaudeAPIError {
    if (!event.error) {
      return new ClaudeAPIError('Unknown streaming error');
    }

    return this.createErrorFromCLIResponse({
      content: '',
      error: event.error,
    });
  }

  /**
   * Transform generic errors
   */
  private transformError(error: unknown): ClaudeAPIError {
    if (error instanceof ClaudeAPIError) {
      return error;
    }

    if (error instanceof Error) {
      // Network/connection errors
      if (error.message.includes('ENOENT') || error.message.includes('command not found')) {
        return new ClaudeNetworkError('Claude CLI not found. Please install Claude Code CLI.');
      }
      
      if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
        return new ClaudeNetworkError(error.message);
      }
      
      // Timeout errors
      if (error.message.includes('timeout')) {
        return new ClaudeTimeoutError(error.message, this.config.timeout || 60000);
      }
    }

    return new ClaudeAPIError(
      error instanceof Error ? error.message : String(error),
      undefined,
      true
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.config.retryDelay || 1000;
    const maxDelay = 30000; // 30 seconds max
    
    let delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    
    // Add jitter
    if (this.config.retryJitter) {
      const jitter = Math.random() * 0.3 * delay;
      delay = delay + jitter;
    }
    
    return Math.floor(delay);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ClaudeCodeCLIConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfiguration(this.config);
    
    this.logger.info('Claude CLI configuration updated', {
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): ClaudeCodeCLIConfig {
    return { ...this.config };
  }

  /**
   * Get process pool status
   */
  getProcessPoolStatus(): {
    active: number;
    total: number;
    requests: number;
    errors: number;
    errorRate: number;
  } {
    const processValues = Array.from(this.processPool.values());
    const active = processValues.filter(p => p.inUse).length;
    const errorRate = this.requestCount > 0 ? this.errorCount / this.requestCount : 0;
    
    return {
      active,
      total: this.processPool.size,
      requests: this.requestCount,
      errors: this.errorCount,
      errorRate,
    };
  }

  /**
   * Convert messages array to prompt format for CLI
   */
  private convertMessagesToPrompt(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    systemPrompt?: string
  ): string {
    // Find system messages and combine them
    const systemMessages = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n\n');
    
    // System messages are combined and handled by --append-system-prompt in buildCommandArgs

    // Convert conversation messages
    const conversationMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const rolePrefix = m.role === 'user' ? 'Human: ' : 'Assistant: ';
        return `${rolePrefix}${m.content}`;
      })
      .join('\n\n');

    // If we have a system prompt, it will be handled by --append-system-prompt
    // Just return the conversation
    return conversationMessages || 'Hello'; // Fallback for empty conversations
  }

  /**
   * Convert CLI response to standard ClaudeResponse format
   */
  private convertCLIResponseToClaudeResponse(
    cliResponse: CLIResponse,
    model: string
  ): ClaudeResponse {
    return {
      id: cliResponse.id || generateId('msg'),
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{
        type: 'text' as const,
        text: cliResponse.content,
      }],
      model: cliResponse.model || model,
      stop_reason: this.mapStopReason(cliResponse.stop_reason),
      stop_sequence: undefined,
      usage: {
        input_tokens: cliResponse.usage?.input_tokens || 0,
        output_tokens: cliResponse.usage?.output_tokens || 0,
      },
    } as ClaudeResponse;
  }

  /**
   * Map CLI stop reasons to ClaudeResponse format
   */
  private mapStopReason(stopReason?: string): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    switch (stopReason) {
      case 'max_tokens':
      case 'length':
        return 'max_tokens';
      case 'stop_sequence':
      case 'stop':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.cleanup();
  }
}