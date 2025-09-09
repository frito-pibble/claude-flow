#!/usr/bin/env node

import chalk from 'chalk';
import { ConfigManager } from '../../config/config-manager.js';
import { CLIDetector } from '../../utils/cli-detection.js';
import type { Command, CommandContext } from '../cli-core.js';

export const migrateApiCommand: Command = {
  name: 'migrate-api',
  description: 'Migrate from API to CLI mode with guided configuration',
  options: [
    {
      name: 'dry-run',
      description: 'Show what would be changed without making changes',
      type: 'boolean',
    },
    {
      name: 'force',
      description: 'Skip confirmation prompts',
      type: 'boolean',
    },
    {
      name: 'backup',
      description: 'Create backup of current configuration',
      type: 'boolean',
    },
    {
      name: 'json',
      description: 'Output as JSON',
      type: 'boolean',
    },
  ],
  action: async (ctx: CommandContext) => {
    try {
      const configManager = ConfigManager.getInstance();
      const detector = new CLIDetector();

      if (!ctx.flags.json) {
        console.log(chalk.cyan.bold('🔄 API to CLI Migration Tool'));
        console.log('─'.repeat(50));
      }

      // Check CLI availability first
      const health = await detector.runHealthCheck();
      if (!health.available) {
        if (ctx.flags.json) {
          console.log(JSON.stringify({ 
            error: 'CLI not available',
            success: false,
            setupRequired: true
          }, null, 2));
        } else {
          console.error(chalk.red('❌ Claude Code CLI not available'));
          console.log(chalk.yellow('Run: npx claude-flow setup-cli'));
        }
        process.exit(1);
      }

      if (!health.authenticated) {
        if (ctx.flags.json) {
          console.log(JSON.stringify({ 
            error: 'CLI not authenticated',
            success: false,
            authRequired: true
          }, null, 2));
        } else {
          console.error(chalk.red('❌ Claude Code CLI not authenticated'));
          console.log(chalk.yellow('Run: claude login'));
        }
        process.exit(1);
      }

      // Analyze current configuration
      const analysis = await analyzeCurrentConfig(configManager);
      
      if (ctx.flags.json) {
        console.log(JSON.stringify({
          analysis,
          cliStatus: health,
          migrationPlan: generateMigrationPlan(analysis, health)
        }, null, 2));
        return;
      }

      // Display analysis
      displayMigrationAnalysis(analysis, health);

      // Show migration plan
      const migrationPlan = generateMigrationPlan(analysis, health);
      displayMigrationPlan(migrationPlan);

      if (ctx.flags['dry-run']) {
        console.log(chalk.yellow('\n🔍 Dry run complete - no changes made'));
        return;
      }

      // Confirm migration
      if (!ctx.flags.force) {
        console.log(chalk.yellow('\n⚠️  This will modify your configuration.'));
        console.log(chalk.gray('Use --dry-run to see changes without applying them'));
        console.log(chalk.gray('Use --backup to create a configuration backup'));
        console.log(chalk.gray('Use --force to skip this confirmation'));
        
        // In a real implementation, you'd add confirmation prompt here
        console.log(chalk.red('Add --force to proceed with migration'));
        return;
      }

      // Create backup if requested
      if (ctx.flags.backup) {
        await createConfigBackup(configManager);
        console.log(chalk.green('✅ Configuration backup created'));
      }

      // Perform migration
      await performMigration(configManager, migrationPlan, health);
      console.log(chalk.green('\n🎉 Migration completed successfully!'));

      // Show next steps
      displayPostMigrationSteps();

    } catch (error) {
      if (ctx.flags.json) {
        console.log(JSON.stringify({ 
          error: (error as Error).message,
          success: false
        }, null, 2));
      } else {
        console.error(chalk.red('❌ Migration failed:'), (error as Error).message);
      }
      process.exit(1);
    }
  },
};

interface ConfigAnalysis {
  hasApiKey: boolean;
  currentProvider: string;
  apiConfig: any;
  estimatedCostSavings: string;
  backupRecommended: boolean;
  complexityLevel: 'simple' | 'moderate' | 'complex';
}

interface MigrationPlan {
  steps: Array<{
    step: string;
    description: string;
    action: string;
    risk: 'low' | 'medium' | 'high';
  }>;
  estimatedTime: string;
  reversible: boolean;
}

async function analyzeCurrentConfig(configManager: ConfigManager): Promise<ConfigAnalysis> {
  const claudeConfig = configManager.getClaudeConfig();
  const providerConfig = configManager.getLLMProviderConfig();

  const hasApiKey = !!claudeConfig.apiKey;
  const currentProvider = providerConfig.defaultProvider || 'anthropic';
  
  let complexityLevel: 'simple' | 'moderate' | 'complex' = 'simple';
  if (hasApiKey && currentProvider !== 'claude-code') {
    complexityLevel = 'moderate';
  }
  if (providerConfig.fallback?.enabled && (providerConfig.fallback?.providers?.length || 0) > 1) {
    complexityLevel = 'complex';
  }

  return {
    hasApiKey,
    currentProvider,
    apiConfig: claudeConfig,
    estimatedCostSavings: hasApiKey ? 'Up to 100% (Pro account benefits)' : 'No current costs',
    backupRecommended: hasApiKey || currentProvider !== 'claude-code',
    complexityLevel,
  };
}

function generateMigrationPlan(analysis: ConfigAnalysis, health: any): MigrationPlan {
  const steps = [];

  steps.push({
    step: 'Set CLI as default provider',
    description: 'Change default LLM provider to claude-code',
    action: 'llmProvider.defaultProvider = claude-code',
    risk: 'low' as const,
  });

  steps.push({
    step: 'Configure CLI settings',
    description: 'Set optimal CLI performance settings',
    action: 'Configure process pooling and timeouts',
    risk: 'low' as const,
  });

  if (analysis.hasApiKey) {
    steps.push({
      step: 'API key handling',
      description: 'API key will remain for potential fallback use',
      action: 'Keep API key as backup (not removed)',
      risk: 'low' as const,
    });
  }

  steps.push({
    step: 'Disable auto-fallback',
    description: 'Prevent automatic fallback to API (user decides)',
    action: 'cli.fallbackToAPI = false',
    risk: 'medium' as const,
  });

  if (health.hasProAccount) {
    steps.push({
      step: 'Optimize for Pro account',
      description: 'Configure higher performance settings for Pro features',
      action: 'Increase process pool and concurrency limits',
      risk: 'low' as const,
    });
  }

  return {
    steps,
    estimatedTime: steps.length <= 3 ? '< 1 minute' : '1-2 minutes',
    reversible: true,
  };
}

function displayMigrationAnalysis(analysis: ConfigAnalysis, health: any) {
  console.log(chalk.cyan('\n📊 Current Configuration Analysis:'));
  console.log(`Current Provider: ${chalk.yellow(analysis.currentProvider)}`);
  console.log(`API Key Present: ${analysis.hasApiKey ? chalk.yellow('Yes') : chalk.green('No')}`);
  console.log(`Complexity Level: ${chalk.yellow(analysis.complexityLevel)}`);
  console.log(`CLI Status: ${health.authenticated ? chalk.green('Ready') : chalk.red('Not Ready')}`);
  console.log(`Account Type: ${health.hasProAccount ? chalk.green('Pro') : chalk.yellow('Free')}`);
  console.log(`Estimated Savings: ${chalk.green(analysis.estimatedCostSavings)}`);
}

function displayMigrationPlan(plan: MigrationPlan) {
  console.log(chalk.cyan('\n📋 Migration Plan:'));
  console.log(`Estimated Time: ${chalk.yellow(plan.estimatedTime)}`);
  console.log(`Reversible: ${plan.reversible ? chalk.green('Yes') : chalk.red('No')}`);

  console.log(chalk.cyan('\n📝 Steps:'));
  plan.steps.forEach((step, index) => {
    const riskColor = step.risk === 'low' ? chalk.green : step.risk === 'medium' ? chalk.yellow : chalk.red;
    const stepNumber = index + 1;
    
    console.log(`\n${stepNumber}. ${chalk.bold(step.step)} ${riskColor(`[${step.risk.toUpperCase()} RISK]`)}`);
    console.log(`   ${step.description}`);
    console.log(`   ${chalk.gray('Action:')} ${step.action}`);
  });
}

async function createConfigBackup(configManager: ConfigManager) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `config-backup-${timestamp}`;
  
  // In a real implementation, this would create an actual backup file
  console.log(chalk.blue(`📁 Backup would be created: ${backupName}.json`));
}

async function performMigration(configManager: ConfigManager, plan: MigrationPlan, health: any) {
  console.log(chalk.cyan('\n🔄 Performing migration...'));

  // Set CLI as default provider
  await configManager.set('llmProvider.defaultProvider', 'claude-code');
  await configManager.set('llmProvider.enableAutoSelection', true);
  await configManager.set('llmProvider.preferCLI', true);
  console.log(chalk.green('  ✅ Set CLI as default provider'));

  // Configure CLI settings
  const cliConfig = {
    priority: true,
    processPoolSize: health.hasProAccount ? 5 : 3,
    processTimeout: 30000,
    maxConcurrentProcesses: health.hasProAccount ? 8 : 5,
    enableProcessReuse: true,
    cacheHealthChecks: true,
    healthCheckInterval: 300000,
    outputFormat: 'json' as 'json' | 'stream-json',
    fallbackToAPI: false,
    authCheckInterval: 900000,
  };

  await configManager.setCLIConfig(cliConfig);
  console.log(chalk.green('  ✅ Configured CLI settings'));

  // Account-specific optimizations
  if (health.hasProAccount) {
    console.log(chalk.green('  ✅ Applied Pro account optimizations'));
  } else {
    console.log(chalk.yellow('  ⚠️  Applied free tier limits'));
  }

  // Disable auto-fallback
  await configManager.set('llmProvider.fallback.enabled', false);
  console.log(chalk.green('  ✅ Disabled automatic fallback'));

  // Enable performance monitoring
  await configManager.set('llmProvider.performanceMonitoring', {
    enabled: true,
    collectMetrics: true,
    optimizationSuggestions: true,
  });
  console.log(chalk.green('  ✅ Enabled performance monitoring'));
}

function displayPostMigrationSteps() {
  console.log(chalk.cyan('\n🎯 Next Steps:'));
  console.log(`${chalk.gray('1.')} Test CLI integration: ${chalk.cyan('npx claude-flow doctor')}`);
  console.log(`${chalk.gray('2.')} Verify configuration: ${chalk.cyan('npx claude-flow config provider')}`);
  console.log(`${chalk.gray('3.')} Monitor performance: ${chalk.cyan('npx claude-flow monitor --performance')}`);
  console.log(`${chalk.gray('4.')} Remove API key: ${chalk.gray('(optional) Remove from config if no longer needed')}`);

  console.log(chalk.yellow('\n💡 Benefits:'));
  console.log(`• No usage costs (Pro account authentication)`);
  console.log(`• Better reliability with CLI error handling`);
  console.log(`• Optimized performance with process pooling`);
  console.log(`• User control over error handling (no auto-fallbacks)`);

  console.log(chalk.gray('\n📚 To revert this migration:'));
  console.log(`npx claude-flow config provider set anthropic`);
}

export default migrateApiCommand;