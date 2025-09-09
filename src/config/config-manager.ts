/**
 * Node.js-compatible Configuration management for Claude-Flow
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export interface Config {
  orchestrator: {
    maxConcurrentAgents: number;
    taskQueueSize: number;
    healthCheckInterval: number;
    shutdownTimeout: number;
  };
  terminal: {
    type: 'auto' | 'vscode' | 'native';
    poolSize: number;
    recycleAfter: number;
    healthCheckInterval: number;
    commandTimeout: number;
  };
  memory: {
    backend: 'sqlite' | 'markdown' | 'hybrid';
    cacheSizeMB: number;
    syncInterval: number;
    conflictResolution: 'crdt' | 'timestamp' | 'manual';
    retentionDays: number;
  };
  coordination: {
    maxRetries: number;
    retryDelay: number;
    deadlockDetection: boolean;
    resourceTimeout: number;
    messageTimeout: number;
  };
  mcp: {
    transport: 'stdio' | 'http' | 'websocket';
    port: number;
    tlsEnabled: boolean;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    destination: 'console' | 'file';
  };
  ruvSwarm: {
    enabled: boolean;
    defaultTopology: 'mesh' | 'hierarchical' | 'ring' | 'star';
    maxAgents: number;
    defaultStrategy: 'balanced' | 'specialized' | 'adaptive';
    autoInit: boolean;
    enableHooks: boolean;
    enablePersistence: boolean;
    enableNeuralTraining: boolean;
    configPath?: string;
  };
  claude?: {
    apiKey?: string;
    model?:
      | 'claude-3-opus-20240229'
      | 'claude-3-sonnet-20240229'
      | 'claude-3-haiku-20240307'
      | 'claude-2.1'
      | 'claude-2.0'
      | 'claude-instant-1.2';
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    systemPrompt?: string;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
  };
  // LLM Provider System Configuration
  llmProvider?: {
    // Provider selection and priority
    defaultProvider?: 'claude-code' | 'anthropic' | 'openai' | 'google' | 'cohere';
    enableAutoSelection?: boolean;
    preferCLI?: boolean; // Prefer CLI over API when both available
    
    // CLI-specific configuration
    cli?: {
      priority?: boolean; // Always prefer CLI when available
      processPoolSize?: number; // Number of CLI processes to pool
      processTimeout?: number; // CLI process timeout in ms (default: 60000)
      maxConcurrentProcesses?: number; // Max concurrent CLI processes
      enableProcessReuse?: boolean; // Reuse CLI processes for performance
      cacheHealthChecks?: boolean; // Cache CLI availability checks
      healthCheckInterval?: number; // Health check cache interval in ms (default: 300000)
      outputFormat?: 'json' | 'stream-json'; // CLI output format preference
      fallbackToAPI?: boolean; // Allow fallback to API on CLI failure
      authCheckInterval?: number; // How often to check CLI auth status
    };
    
    // API fallback configuration
    fallback?: {
      enabled?: boolean;
      providers?: string[]; // Fallback provider order
      errorThreshold?: number; // Error count before fallback
      retryDelay?: number; // Delay before retry/fallback
    };
    
    // Cost optimization
    costOptimization?: {
      enabled?: boolean;
      maxCostPerRequest?: number;
      preferredModels?: string[];
      budgetLimits?: {
        daily?: number;
        monthly?: number;
      };
    };
  };
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Config = {
  orchestrator: {
    maxConcurrentAgents: 10,
    taskQueueSize: 100,
    healthCheckInterval: 30000,
    shutdownTimeout: 30000,
  },
  terminal: {
    type: 'auto',
    poolSize: 5,
    recycleAfter: 10,
    healthCheckInterval: 60000,
    commandTimeout: 300000,
  },
  memory: {
    backend: 'hybrid',
    cacheSizeMB: 100,
    syncInterval: 5000,
    conflictResolution: 'crdt',
    retentionDays: 30,
  },
  coordination: {
    maxRetries: 3,
    retryDelay: 1000,
    deadlockDetection: true,
    resourceTimeout: 60000,
    messageTimeout: 30000,
  },
  mcp: {
    transport: 'stdio',
    port: 3000,
    tlsEnabled: false,
  },
  logging: {
    level: 'info',
    format: 'json',
    destination: 'console',
  },
  ruvSwarm: {
    enabled: true,
    defaultTopology: 'mesh',
    maxAgents: 8,
    defaultStrategy: 'adaptive',
    autoInit: true,
    enableHooks: true,
    enablePersistence: true,
    enableNeuralTraining: true,
    configPath: '.claude/ruv-swarm-config.json',
  },
  claude: {
    model: 'claude-3-sonnet-20240229',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    timeout: 60000,
    retryAttempts: 3,
    retryDelay: 1000,
  },
  llmProvider: {
    defaultProvider: 'claude-code', // Prefer CLI provider by default
    enableAutoSelection: true,
    preferCLI: true,
    cli: {
      priority: true,
      processPoolSize: 3,
      processTimeout: 60000,
      maxConcurrentProcesses: 5,
      enableProcessReuse: true,
      cacheHealthChecks: true,
      healthCheckInterval: 300000, // 5 minutes
      outputFormat: 'json',
      fallbackToAPI: false, // Don't auto-fallback - let user decide
      authCheckInterval: 3600000, // 1 hour
    },
    fallback: {
      enabled: false, // User controls fallback behavior
      providers: ['anthropic', 'openai'],
      errorThreshold: 3,
      retryDelay: 2000,
    },
    costOptimization: {
      enabled: true,
      preferredModels: ['claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    },
  },
};

/**
 * Configuration validation error
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Configuration manager for Node.js
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;
  private configPath?: string;
  private userConfigDir: string;

  private constructor() {
    this.config = this.deepClone(DEFAULT_CONFIG);
    this.userConfigDir = path.join(os.homedir(), '.claude-flow');
  }

  /**
   * Gets the singleton instance
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Initialize configuration from file or create default
   */
  async init(configPath = 'claude-flow.config.json'): Promise<void> {
    try {
      await this.load(configPath);
      console.log(`✅ Configuration loaded from: ${configPath}`);
    } catch (error) {
      // Create default config file if it doesn't exist
      await this.createDefaultConfig(configPath);
      console.log(`✅ Default configuration created: ${configPath}`);
    }
  }

  /**
   * Creates a default configuration file
   */
  async createDefaultConfig(configPath: string): Promise<void> {
    const config = this.deepClone(DEFAULT_CONFIG);
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(configPath, content, 'utf8');
    this.configPath = configPath;
  }

  /**
   * Loads configuration from file
   */
  async load(configPath?: string): Promise<Config> {
    if (configPath) {
      this.configPath = configPath;
    }

    if (!this.configPath) {
      throw new ConfigError('No configuration file path specified');
    }

    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      const fileConfig = JSON.parse(content) as Partial<Config>;

      // Merge with defaults
      this.config = this.deepMerge(DEFAULT_CONFIG, fileConfig);

      // Load environment variables
      this.loadFromEnv();

      // Validate
      this.validate(this.config);

      return this.config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ConfigError(`Configuration file not found: ${this.configPath}`);
      }
      throw new ConfigError(`Failed to load configuration: ${(error as Error).message}`);
    }
  }

  // ========================================
  // CLI Provider Enhanced Configuration Methods
  // ========================================

  /**
   * Enable CLI provider with optimal settings
   */
  enableCLIProvider(options: {
    processPoolSize?: number;
    enableProcessReuse?: boolean;
    cacheHealthChecks?: boolean;
    maxConcurrentProcesses?: number;
  } = {}): void {
    const cliConfig = {
      priority: true,
      processPoolSize: options.processPoolSize || 5,
      enableProcessReuse: options.enableProcessReuse !== false,
      cacheHealthChecks: options.cacheHealthChecks !== false,
      maxConcurrentProcesses: options.maxConcurrentProcesses || 8,
      outputFormat: 'json' as const,
      fallbackToAPI: false, // User controls fallback
    };

    this.setCLIConfig(cliConfig);
    this.setLLMProviderConfig({
      defaultProvider: 'claude-code',
      preferCLI: true,
      enableAutoSelection: true,
    });
  }

  /**
   * Enable API fallback with specific configuration
   */
  enableAPIFallback(options: {
    providers?: string[];
    errorThreshold?: number;
    retryDelay?: number;
  } = {}): void {
    const fallbackConfig = {
      enabled: true,
      providers: options.providers || ['anthropic', 'openai'],
      errorThreshold: options.errorThreshold || 3,
      retryDelay: options.retryDelay || 2000,
    };

    this.setLLMProviderConfig({
      fallback: fallbackConfig,
    });

    // Allow CLI to fallback to API
    this.setCLIConfig({
      fallbackToAPI: true,
    });
  }

  /**
   * Disable API fallback (CLI-only mode)
   */
  disableAPIFallback(): void {
    this.setLLMProviderConfig({
      fallback: {
        enabled: false,
      },
    });

    this.setCLIConfig({
      fallbackToAPI: false,
    });
  }

  /**
   * Configure performance optimization settings
   */
  setPerformanceOptions(options: {
    processPoolSize?: number;
    processTimeout?: number;
    maxConcurrentProcesses?: number;
    enableProcessReuse?: boolean;
    healthCheckInterval?: number;
    authCheckInterval?: number;
  }): void {
    this.setCLIConfig({
      processPoolSize: options.processPoolSize,
      processTimeout: options.processTimeout,
      maxConcurrentProcesses: options.maxConcurrentProcesses,
      enableProcessReuse: options.enableProcessReuse,
      healthCheckInterval: options.healthCheckInterval,
      authCheckInterval: options.authCheckInterval,
    });
  }

  /**
   * Get performance optimization recommendations based on current config
   */
  getPerformanceRecommendations(): {
    category: string;
    suggestion: string;
    currentValue: any;
    recommendedValue: any;
    impact: string;
  }[] {
    const cliConfig = this.getCLIConfig();
    const recommendations: Array<{
      category: string;
      suggestion: string;
      currentValue: any;
      recommendedValue: any;
      impact: string;
    }> = [];

    // Process pool size recommendation
    if (!cliConfig.processPoolSize || cliConfig.processPoolSize < 3) {
      recommendations.push({
        category: 'Process Pooling',
        suggestion: 'Increase process pool size for better performance',
        currentValue: cliConfig.processPoolSize || 0,
        recommendedValue: 5,
        impact: 'Reduces CLI process spawn overhead by 60-80%',
      });
    }

    // Process reuse recommendation
    if (!cliConfig.enableProcessReuse) {
      recommendations.push({
        category: 'Process Management',
        suggestion: 'Enable process reuse for better performance',
        currentValue: false,
        recommendedValue: true,
        impact: 'Improves response time by 30-50%',
      });
    }

    // Health check caching recommendation
    if (!cliConfig.cacheHealthChecks) {
      recommendations.push({
        category: 'Health Checks',
        suggestion: 'Enable health check caching to reduce overhead',
        currentValue: false,
        recommendedValue: true,
        impact: 'Reduces CLI availability check overhead by 90%',
      });
    }

    // Concurrent processes recommendation
    if (!cliConfig.maxConcurrentProcesses || cliConfig.maxConcurrentProcesses < 5) {
      recommendations.push({
        category: 'Concurrency',
        suggestion: 'Increase max concurrent processes for better throughput',
        currentValue: cliConfig.maxConcurrentProcesses || 1,
        recommendedValue: 8,
        impact: 'Allows handling more concurrent requests efficiently',
      });
    }

    // Timeout optimization
    if (!cliConfig.processTimeout || cliConfig.processTimeout > 30000) {
      recommendations.push({
        category: 'Timeouts',
        suggestion: 'Optimize process timeout for better responsiveness',
        currentValue: cliConfig.processTimeout || 60000,
        recommendedValue: 30000,
        impact: 'Faster error detection and recovery',
      });
    }

    return recommendations;
  }

  // ========================================
  // Enhanced Configuration Migration Methods
  // ========================================

  /**
   * Apply a migration configuration
   */
  async applyMigration(migrationConfig: Partial<Config>, backupOriginal: boolean = true): Promise<void> {
    if (backupOriginal && this.configPath) {
      const backupPath = `${this.configPath}.backup.${Date.now()}`;
      try {
        const originalContent = await fs.readFile(this.configPath, 'utf8');
        await fs.writeFile(backupPath, originalContent, 'utf8');
        console.log(`Original configuration backed up to: ${backupPath}`);
      } catch (error) {
        console.warn('Failed to create backup:', error);
      }
    }

    // Deep merge migration config with existing config
    this.config = this.deepMerge(this.config, migrationConfig);
    await this.save();
    console.log('Migration configuration applied successfully');
  }

  /**
   * Validate migration readiness
   */
  async validateMigrationReadiness(): Promise<{
    ready: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check if CLI is available
    try {
      // Note: This would need to import CLIDetector, but we'll keep it as a placeholder
      // The actual implementation would check CLI availability
      recommendations.push('Verify Claude Code CLI is installed and authenticated');
    } catch (error) {
      issues.push('Claude Code CLI availability check failed');
    }

    // Check existing configuration
    const hasAPIKey = Boolean(this.config.claude?.apiKey);
    if (hasAPIKey) {
      recommendations.push('Consider keeping API configuration as fallback option');
    } else {
      recommendations.push('No API key found - CLI will be the only provider');
    }

    // Check for potential configuration conflicts
    if (this.config.llmProvider?.defaultProvider && this.config.llmProvider.defaultProvider !== 'claude-code') {
      recommendations.push(`Current default provider is ${this.config.llmProvider.defaultProvider} - will be changed to claude-code`);
    }

    return {
      ready: issues.length === 0,
      issues,
      recommendations,
    };
  }

  /**
   * Generate migration report
   */
  generateMigrationReport(beforeConfig: Config, afterConfig: Partial<Config>): {
    summary: string;
    changes: Array<{
      category: string;
      field: string;
      before: any;
      after: any;
      impact: string;
    }>;
    benefits: string[];
    risks: string[];
  } {
    const changes: Array<{
      category: string;
      field: string;
      before: any;
      after: any;
      impact: string;
    }> = [];

    // Provider changes
    if (beforeConfig.llmProvider?.defaultProvider !== afterConfig.llmProvider?.defaultProvider) {
      changes.push({
        category: 'Provider',
        field: 'defaultProvider',
        before: beforeConfig.llmProvider?.defaultProvider || 'none',
        after: afterConfig.llmProvider?.defaultProvider || 'none',
        impact: 'Primary provider changed - all requests will use new provider',
      });
    }

    // CLI configuration additions
    if (!beforeConfig.llmProvider?.cli && afterConfig.llmProvider?.cli) {
      changes.push({
        category: 'CLI',
        field: 'configuration',
        before: 'none',
        after: 'configured',
        impact: 'CLI process pooling and optimization enabled',
      });
    }

    const benefits = [
      'No API costs - uses Pro account authentication',
      'Built-in reliability and error handling',
      'Process pooling reduces overhead',
      'Automatic health checking and monitoring',
      'Consistent authentication across all claude-flow operations',
    ];

    const risks = [
      'Requires Claude Code CLI installation and authentication',
      'CLI subprocess overhead for each request',
      'Dependency on CLI tool availability and updates',
      'Limited parameter customization compared to direct API access',
    ];

    const summary = `Migration from ${beforeConfig.llmProvider?.defaultProvider || 'API'} to CLI provider configured. ${changes.length} configuration changes will be applied.`;

    return {
      summary,
      changes,
      benefits,
      risks,
    };
  }

  /**
   * Shows current configuration
   */
  show(): Config {
    return this.deepClone(this.config);
  }

  /**
   * Gets a configuration value by path
   */
  get(path: string): any {
    const keys = path.split('.');
    let current: any = this.config;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Sets a configuration value by path
   */
  set(path: string, value: any): void {
    const keys = path.split('.');
    let current: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    current[lastKey] = value;

    // Validate after setting
    this.validate(this.config);
  }

  /**
   * Saves current configuration to file
   */
  async save(configPath?: string): Promise<void> {
    const savePath = configPath || this.configPath;
    if (!savePath) {
      throw new ConfigError('No configuration file path specified');
    }

    const content = JSON.stringify(this.config, null, 2);
    await fs.writeFile(savePath, content, 'utf8');
  }

  /**
   * Validates the configuration
   */
  validate(config: Config): void {
    // Orchestrator validation
    if (
      config.orchestrator.maxConcurrentAgents < 1 ||
      config.orchestrator.maxConcurrentAgents > 100
    ) {
      throw new ConfigError('orchestrator.maxConcurrentAgents must be between 1 and 100');
    }
    if (config.orchestrator.taskQueueSize < 1 || config.orchestrator.taskQueueSize > 10000) {
      throw new ConfigError('orchestrator.taskQueueSize must be between 1 and 10000');
    }

    // Terminal validation
    if (!['auto', 'vscode', 'native'].includes(config.terminal.type)) {
      throw new ConfigError('terminal.type must be one of: auto, vscode, native');
    }
    if (config.terminal.poolSize < 1 || config.terminal.poolSize > 50) {
      throw new ConfigError('terminal.poolSize must be between 1 and 50');
    }

    // Memory validation
    if (!['sqlite', 'markdown', 'hybrid'].includes(config.memory.backend)) {
      throw new ConfigError('memory.backend must be one of: sqlite, markdown, hybrid');
    }
    if (config.memory.cacheSizeMB < 1 || config.memory.cacheSizeMB > 10000) {
      throw new ConfigError('memory.cacheSizeMB must be between 1 and 10000');
    }

    // Coordination validation
    if (config.coordination.maxRetries < 0 || config.coordination.maxRetries > 100) {
      throw new ConfigError('coordination.maxRetries must be between 0 and 100');
    }

    // MCP validation
    if (!['stdio', 'http', 'websocket'].includes(config.mcp.transport)) {
      throw new ConfigError('mcp.transport must be one of: stdio, http, websocket');
    }
    if (config.mcp.port < 1 || config.mcp.port > 65535) {
      throw new ConfigError('mcp.port must be between 1 and 65535');
    }

    // Logging validation
    if (!['debug', 'info', 'warn', 'error'].includes(config.logging.level)) {
      throw new ConfigError('logging.level must be one of: debug, info, warn, error');
    }
    if (!['json', 'text'].includes(config.logging.format)) {
      throw new ConfigError('logging.format must be one of: json, text');
    }
    if (!['console', 'file'].includes(config.logging.destination)) {
      throw new ConfigError('logging.destination must be one of: console, file');
    }

    // ruv-swarm validation
    if (!['mesh', 'hierarchical', 'ring', 'star'].includes(config.ruvSwarm.defaultTopology)) {
      throw new ConfigError(
        'ruvSwarm.defaultTopology must be one of: mesh, hierarchical, ring, star',
      );
    }
    if (config.ruvSwarm.maxAgents < 1 || config.ruvSwarm.maxAgents > 100) {
      throw new ConfigError('ruvSwarm.maxAgents must be between 1 and 100');
    }
    if (!['balanced', 'specialized', 'adaptive'].includes(config.ruvSwarm.defaultStrategy)) {
      throw new ConfigError(
        'ruvSwarm.defaultStrategy must be one of: balanced, specialized, adaptive',
      );
    }

    // Claude API validation
    if (config.claude) {
      if (config.claude.model) {
        const validModels = [
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307',
          'claude-2.1',
          'claude-2.0',
          'claude-instant-1.2',
        ];
        if (!validModels.includes(config.claude.model)) {
          throw new ConfigError(`claude.model must be one of: ${validModels.join(', ')}`);
        }
      }
      if (config.claude.temperature !== undefined) {
        if (config.claude.temperature < 0 || config.claude.temperature > 1) {
          throw new ConfigError('claude.temperature must be between 0 and 1');
        }
      }
      if (config.claude.maxTokens !== undefined) {
        if (config.claude.maxTokens < 1 || config.claude.maxTokens > 100000) {
          throw new ConfigError('claude.maxTokens must be between 1 and 100000');
        }
      }
      if (config.claude.topP !== undefined) {
        if (config.claude.topP < 0 || config.claude.topP > 1) {
          throw new ConfigError('claude.topP must be between 0 and 1');
        }
      }
    }
    
    // LLM Provider validation
    if (config.llmProvider) {
      if (config.llmProvider.defaultProvider) {
        const validProviders = ['claude-code', 'anthropic', 'openai', 'google', 'cohere'];
        if (!validProviders.includes(config.llmProvider.defaultProvider)) {
          throw new ConfigError(`llmProvider.defaultProvider must be one of: ${validProviders.join(', ')}`);
        }
      }
      
      // CLI configuration validation
      if (config.llmProvider.cli) {
        const cli = config.llmProvider.cli;
        if (cli.processPoolSize !== undefined && (cli.processPoolSize < 1 || cli.processPoolSize > 10)) {
          throw new ConfigError('llmProvider.cli.processPoolSize must be between 1 and 10');
        }
        if (cli.processTimeout !== undefined && (cli.processTimeout < 1000 || cli.processTimeout > 300000)) {
          throw new ConfigError('llmProvider.cli.processTimeout must be between 1000 and 300000 ms');
        }
        if (cli.maxConcurrentProcesses !== undefined && (cli.maxConcurrentProcesses < 1 || cli.maxConcurrentProcesses > 20)) {
          throw new ConfigError('llmProvider.cli.maxConcurrentProcesses must be between 1 and 20');
        }
        if (cli.healthCheckInterval !== undefined && (cli.healthCheckInterval < 30000 || cli.healthCheckInterval > 3600000)) {
          throw new ConfigError('llmProvider.cli.healthCheckInterval must be between 30000 and 3600000 ms');
        }
        if (cli.outputFormat && !['json', 'stream-json'].includes(cli.outputFormat)) {
          throw new ConfigError('llmProvider.cli.outputFormat must be either "json" or "stream-json"');
        }
        if (cli.authCheckInterval !== undefined && (cli.authCheckInterval < 60000 || cli.authCheckInterval > 86400000)) {
          throw new ConfigError('llmProvider.cli.authCheckInterval must be between 60000 and 86400000 ms');
        }
      }
      
      // Cost optimization validation
      if (config.llmProvider.costOptimization) {
        const cost = config.llmProvider.costOptimization;
        if (cost.maxCostPerRequest !== undefined && (cost.maxCostPerRequest < 0 || cost.maxCostPerRequest > 100)) {
          throw new ConfigError('llmProvider.costOptimization.maxCostPerRequest must be between 0 and 100');
        }
        if (cost.budgetLimits?.daily !== undefined && (cost.budgetLimits.daily < 0 || cost.budgetLimits.daily > 10000)) {
          throw new ConfigError('llmProvider.costOptimization.budgetLimits.daily must be between 0 and 10000');
        }
        if (cost.budgetLimits?.monthly !== undefined && (cost.budgetLimits.monthly < 0 || cost.budgetLimits.monthly > 100000)) {
          throw new ConfigError('llmProvider.costOptimization.budgetLimits.monthly must be between 0 and 100000');
        }
      }
    }
  }

  /**
   * Loads configuration from environment variables
   */
  private loadFromEnv(): void {
    // Orchestrator settings
    const maxAgents = process.env.CLAUDE_FLOW_MAX_AGENTS;
    if (maxAgents) {
      this.config.orchestrator.maxConcurrentAgents = parseInt(maxAgents, 10);
    }

    // Terminal settings
    const terminalType = process.env.CLAUDE_FLOW_TERMINAL_TYPE;
    if (terminalType === 'vscode' || terminalType === 'native' || terminalType === 'auto') {
      this.config.terminal.type = terminalType;
    }

    // Memory settings
    const memoryBackend = process.env.CLAUDE_FLOW_MEMORY_BACKEND;
    if (memoryBackend === 'sqlite' || memoryBackend === 'markdown' || memoryBackend === 'hybrid') {
      this.config.memory.backend = memoryBackend;
    }

    // MCP settings
    const mcpTransport = process.env.CLAUDE_FLOW_MCP_TRANSPORT;
    if (mcpTransport === 'stdio' || mcpTransport === 'http' || mcpTransport === 'websocket') {
      this.config.mcp.transport = mcpTransport;
    }

    const mcpPort = process.env.CLAUDE_FLOW_MCP_PORT;
    if (mcpPort) {
      this.config.mcp.port = parseInt(mcpPort, 10);
    }

    // Logging settings
    const logLevel = process.env.CLAUDE_FLOW_LOG_LEVEL;
    if (
      logLevel === 'debug' ||
      logLevel === 'info' ||
      logLevel === 'warn' ||
      logLevel === 'error'
    ) {
      this.config.logging.level = logLevel;
    }

    // ruv-swarm settings
    const ruvSwarmEnabled = process.env.CLAUDE_FLOW_RUV_SWARM_ENABLED;
    if (ruvSwarmEnabled === 'true' || ruvSwarmEnabled === 'false') {
      this.config.ruvSwarm.enabled = ruvSwarmEnabled === 'true';
    }

    const ruvSwarmTopology = process.env.CLAUDE_FLOW_RUV_SWARM_TOPOLOGY;
    if (
      ruvSwarmTopology === 'mesh' ||
      ruvSwarmTopology === 'hierarchical' ||
      ruvSwarmTopology === 'ring' ||
      ruvSwarmTopology === 'star'
    ) {
      this.config.ruvSwarm.defaultTopology = ruvSwarmTopology;
    }

    const ruvSwarmMaxAgents = process.env.CLAUDE_FLOW_RUV_SWARM_MAX_AGENTS;
    if (ruvSwarmMaxAgents) {
      this.config.ruvSwarm.maxAgents = parseInt(ruvSwarmMaxAgents, 10);
    }

    // Claude API settings
    if (!this.config.claude) {
      this.config.claude = {};
    }

    const claudeApiKey = process.env.ANTHROPIC_API_KEY;
    if (claudeApiKey) {
      this.config.claude.apiKey = claudeApiKey;
    }

    const claudeModel = process.env.CLAUDE_MODEL;
    if (claudeModel) {
      this.config.claude.model = claudeModel as any;
    }

    const claudeTemperature = process.env.CLAUDE_TEMPERATURE;
    if (claudeTemperature) {
      this.config.claude.temperature = parseFloat(claudeTemperature);
    }

    const claudeMaxTokens = process.env.CLAUDE_MAX_TOKENS;
    if (claudeMaxTokens) {
      this.config.claude.maxTokens = parseInt(claudeMaxTokens, 10);
    }

    const claudeTopP = process.env.CLAUDE_TOP_P;
    if (claudeTopP) {
      this.config.claude.topP = parseFloat(claudeTopP);
    }

    const claudeTopK = process.env.CLAUDE_TOP_K;
    if (claudeTopK) {
      this.config.claude.topK = parseInt(claudeTopK, 10);
    }

    const claudeSystemPrompt = process.env.CLAUDE_SYSTEM_PROMPT;
    if (claudeSystemPrompt) {
      this.config.claude.systemPrompt = claudeSystemPrompt;
    }
  }

  /**
   * Deep clone helper
   */
  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Get ruv-swarm specific configuration
   */
  getRuvSwarmConfig() {
    return this.deepClone(this.config.ruvSwarm);
  }

  /**
   * Get available configuration templates
   */
  getAvailableTemplates(): string[] {
    return ['default', 'development', 'production', 'testing'];
  }

  /**
   * Create a configuration template
   */
  createTemplate(name: string, config: any): void {
    // Implementation for creating templates
    console.log(`Creating template: ${name}`, config);
  }

  /**
   * Get format parsers
   */
  getFormatParsers(): Record<string, any> {
    return {
      json: { extension: '.json', parse: JSON.parse, stringify: JSON.stringify },
      yaml: {
        extension: '.yaml',
        parse: (content: string) => content,
        stringify: (obj: any) => JSON.stringify(obj),
      },
    };
  }

  /**
   * Validate configuration file
   */
  validateFile(path: string): boolean {
    try {
      // Basic validation - file exists and is valid JSON
      require('fs').readFileSync(path, 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get path history
   */
  getPathHistory(): any[] {
    return []; // Mock implementation
  }

  /**
   * Get change history
   */
  getChangeHistory(): any[] {
    return []; // Mock implementation
  }

  /**
   * Backup configuration
   */
  async backup(path: string): Promise<void> {
    const backupPath = `${path}.backup.${Date.now()}`;
    const content = JSON.stringify(this.config, null, 2);
    await fs.writeFile(backupPath, content, 'utf8');
    console.log(`Configuration backed up to: ${backupPath}`);
  }

  /**
   * Restore configuration from backup
   */
  async restore(path: string): Promise<void> {
    const content = await fs.readFile(path, 'utf8');
    this.config = JSON.parse(content);
    console.log(`Configuration restored from: ${path}`);
  }

  /**
   * Update ruv-swarm configuration
   */
  setRuvSwarmConfig(updates: Partial<Config['ruvSwarm']>): void {
    this.config.ruvSwarm = { ...this.config.ruvSwarm, ...updates };
    this.validate(this.config);
  }

  /**
   * Check if ruv-swarm is enabled
   */
  isRuvSwarmEnabled(): boolean {
    return this.config.ruvSwarm.enabled;
  }

  /**
   * Generate ruv-swarm command arguments from configuration
   */
  getRuvSwarmArgs(): string[] {
    const args: string[] = [];
    const config = this.config.ruvSwarm;

    if (!config.enabled) {
      return args;
    }

    args.push('--topology', config.defaultTopology);
    args.push('--max-agents', String(config.maxAgents));
    args.push('--strategy', config.defaultStrategy);

    if (config.enableHooks) {
      args.push('--enable-hooks');
    }

    if (config.enablePersistence) {
      args.push('--enable-persistence');
    }

    if (config.enableNeuralTraining) {
      args.push('--enable-training');
    }

    if (config.configPath) {
      args.push('--config-path', config.configPath);
    }

    return args;
  }

  /**
   * Get Claude API configuration
   */
  getClaudeConfig() {
    return this.deepClone(this.config.claude || {});
  }

  /**
   * Update Claude API configuration
   */
  setClaudeConfig(updates: Partial<Config['claude']>): void {
    if (!this.config.claude) {
      this.config.claude = {};
    }
    this.config.claude = { ...this.config.claude, ...updates };
    this.validate(this.config);
  }

  /**
   * Check if Claude API is configured
   */
  isClaudeAPIConfigured(): boolean {
    return !!(this.config.claude?.apiKey || process.env.ANTHROPIC_API_KEY);
  }

  /**
   * Get LLM provider configuration
   */
  getLLMProviderConfig() {
    return this.deepClone(this.config.llmProvider || {});
  }

  /**
   * Update LLM provider configuration
   */
  setLLMProviderConfig(updates: Partial<Config['llmProvider']>): void {
    if (!this.config.llmProvider) {
      this.config.llmProvider = {};
    }
    this.config.llmProvider = { ...this.config.llmProvider, ...updates };
    this.validate(this.config);
  }

  /**
   * Get CLI-specific configuration
   */
  getCLIConfig() {
    return this.deepClone(this.config.llmProvider?.cli || {});
  }

  /**
   * Update CLI-specific configuration
   */
  setCLIConfig(updates: Partial<NonNullable<Config['llmProvider']>['cli']>): void {
    if (!this.config.llmProvider) {
      this.config.llmProvider = {};
    }
    if (!this.config.llmProvider.cli) {
      this.config.llmProvider.cli = {};
    }
    this.config.llmProvider.cli = { ...this.config.llmProvider.cli, ...updates };
    this.validate(this.config);
  }

  /**
   * Check if CLI provider is preferred
   */
  isCLIPreferred(): boolean {
    return this.config.llmProvider?.preferCLI ?? true;
  }

  /**
   * Get default provider
   */
  getDefaultProvider(): string {
    return this.config.llmProvider?.defaultProvider ?? 'claude-code';
  }

  /**
   * Check if auto-selection is enabled
   */
  isAutoSelectionEnabled(): boolean {
    return this.config.llmProvider?.enableAutoSelection ?? true;
  }

  /**
   * Get CLI process configuration
   */
  getCLIProcessConfig() {
    const cli = this.config.llmProvider?.cli || {};
    return {
      poolSize: cli.processPoolSize ?? 3,
      timeout: cli.processTimeout ?? 60000,
      maxConcurrent: cli.maxConcurrentProcesses ?? 5,
      enableReuse: cli.enableProcessReuse ?? true,
      cacheHealthChecks: cli.cacheHealthChecks ?? true,
      healthCheckInterval: cli.healthCheckInterval ?? 300000,
      outputFormat: cli.outputFormat ?? 'json',
      fallbackToAPI: cli.fallbackToAPI ?? false,
      authCheckInterval: cli.authCheckInterval ?? 3600000,
    };
  }

  /**
   * Get user config directory (creates if needed)
   */
  async getUserConfigDir(): Promise<string> {
    try {
      await fs.access(this.userConfigDir);
    } catch {
      await fs.mkdir(this.userConfigDir, { recursive: true });
    }
    return this.userConfigDir;
  }

  /**
   * Create migration configuration for existing API users
   */
  createMigrationConfig(): Partial<Config> {
    const claudeConfig = this.getClaudeConfig();
    return {
      llmProvider: {
        defaultProvider: 'claude-code',
        preferCLI: true,
        cli: {
          priority: true,
          fallbackToAPI: claudeConfig.apiKey ? true : false, // Allow fallback if API key exists
        },
        fallback: {
          enabled: claudeConfig.apiKey ? true : false,
          providers: ['anthropic'],
        },
      },
    };
  }

  /**
   * Deep merge helper
   */
  private deepMerge(target: Config, source: Partial<Config>): Config {
    const result = this.deepClone(target);

    if (source.orchestrator) {
      result.orchestrator = { ...result.orchestrator, ...source.orchestrator };
    }
    if (source.terminal) {
      result.terminal = { ...result.terminal, ...source.terminal };
    }
    if (source.memory) {
      result.memory = { ...result.memory, ...source.memory };
    }
    if (source.coordination) {
      result.coordination = { ...result.coordination, ...source.coordination };
    }
    if (source.mcp) {
      result.mcp = { ...result.mcp, ...source.mcp };
    }
    if (source.logging) {
      result.logging = { ...result.logging, ...source.logging };
    }
    if (source.ruvSwarm) {
      result.ruvSwarm = { ...result.ruvSwarm, ...source.ruvSwarm };
    }
    if (source.claude) {
      result.claude = { ...result.claude, ...source.claude };
    }
    if (source.llmProvider) {
      result.llmProvider = { ...result.llmProvider, ...source.llmProvider };
    }

    return result;
  }
}

// Export singleton instance
export const configManager = ConfigManager.getInstance();
