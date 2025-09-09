#!/usr/bin/env node

import chalk from 'chalk';
import { CLIDetector, CLISetupGuidance } from '../../utils/cli-detection.js';
import { ConfigManager } from '../../config/config-manager.js';
import type { Command, CommandContext } from '../cli-core.js';

export const setupCliCommand: Command = {
  name: 'setup-cli',
  description: 'Guide CLI setup process for Claude Code integration',
  options: [
    {
      name: 'check-only',
      description: 'Only check current status, do not run setup',
      type: 'boolean',
    },
    {
      name: 'auto-configure',
      description: 'Automatically configure optimal settings',
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
      const detector = new CLIDetector();
      const configManager = ConfigManager.getInstance();

      if (!ctx.flags.json) {
        console.log(chalk.cyan.bold('🚀 Claude Code CLI Setup Guide'));
        console.log('─'.repeat(50));
      }

      // Check current status
      const health = await detector.runHealthCheck(true); // Force refresh

      if (ctx.flags['check-only']) {
        displaySetupStatus(health, ctx.flags.json as boolean);
        return;
      }

      // Get setup guidance
      const guidance = await detector.getCLISetupGuidance();

      if (ctx.flags.json) {
        console.log(JSON.stringify({
          currentStatus: health,
          setupSteps: guidance,
          autoConfigureAvailable: ctx.flags['auto-configure']
        }, null, 2));
        return;
      }

      // Display current status
      displaySetupStatus(health, false);

      // Show setup steps if needed
      if (!health.available || !health.authenticated) {
        console.log(chalk.yellow('\n📋 Setup Steps Required:'));
        displaySetupSteps(guidance);
      }

      // Auto-configure if requested and CLI is ready
      if (ctx.flags['auto-configure'] && health.available && health.authenticated) {
        console.log(chalk.cyan('\n⚙️  Auto-configuring optimal settings...'));
        await autoConfigureCLI(configManager, health);
        console.log(chalk.green('✅ Auto-configuration complete!'));
      } else if (health.available && health.authenticated) {
        console.log(chalk.green('\n🎉 CLI is ready! Run with --auto-configure to optimize settings.'));
      }

    } catch (error) {
      if (ctx.flags.json) {
        console.log(JSON.stringify({ 
          error: (error as Error).message,
          success: false
        }, null, 2));
      } else {
        console.error(chalk.red('❌ Setup failed:'), (error as Error).message);
      }
      process.exit(1);
    }
  },
};

function displaySetupStatus(health: any, json: boolean) {
  if (json) {
    console.log(JSON.stringify(health, null, 2));
    return;
  }

  console.log(chalk.cyan('\n📊 Current Status:'));
  console.log(`CLI Installed: ${health.available ? chalk.green('✅') : chalk.red('❌')}`);
  console.log(`Authenticated: ${health.authenticated ? chalk.green('✅') : chalk.red('❌')}`);
  console.log(`Pro Account: ${health.hasProAccount ? chalk.green('✅') : chalk.yellow('⚠️')}`);
  
  if (health.version) {
    console.log(`Version: ${chalk.blue(health.version)}`);
  }
}

function displaySetupSteps(guidance: CLISetupGuidance[]) {
  guidance.forEach((step, index) => {
    const stepNumber = index + 1;
    const icon = step.required ? '🔴' : '🟡';
    
    console.log(`\n${icon} Step ${stepNumber}: ${chalk.bold(step.title)}`);
    console.log(`   ${step.description}`);
    
    if (step.command) {
      console.log(`   ${chalk.gray('Command:')} ${chalk.cyan(step.command)}`);
    }
    
    if (step.url) {
      console.log(`   ${chalk.gray('URL:')} ${chalk.blue(step.url)}`);
    }
  });

  console.log(chalk.yellow('\n💡 After completing setup steps, run:'));
  console.log(`   ${chalk.cyan('npx claude-flow doctor')} - to verify installation`);
  console.log(`   ${chalk.cyan('npx claude-flow setup-cli --auto-configure')} - to optimize settings`);
}

async function autoConfigureCLI(configManager: ConfigManager, health: any) {
  // Set CLI as default provider
  await configManager.setCLIConfig({
    priority: true,
    processPoolSize: 3,
    processTimeout: 30000,
    maxConcurrentProcesses: 5,
    enableProcessReuse: true,
    cacheHealthChecks: true,
    healthCheckInterval: 300000, // 5 minutes
    outputFormat: 'json',
    fallbackToAPI: false, // Don't auto-fallback, let user decide
    authCheckInterval: 900000, // 15 minutes
  });

  // Configure default provider
  await configManager.set('llmProvider.defaultProvider', 'claude-code');
  await configManager.set('llmProvider.enableAutoSelection', true);
  await configManager.set('llmProvider.preferCLI', true);

  // Set performance optimizations based on Pro account status
  if (health.hasProAccount) {
    // Pro account can handle higher concurrency
    await configManager.setCLIConfig({
      processPoolSize: 5,
      maxConcurrentProcesses: 8,
    });
    
    console.log(chalk.green('  ✅ Configured for Pro account performance'));
  } else {
    // Free tier - more conservative settings
    await configManager.setCLIConfig({
      processPoolSize: 2,
      maxConcurrentProcesses: 3,
    });
    
    console.log(chalk.yellow('  ⚠️  Configured for free tier limits'));
  }

  // Enable performance monitoring
  await configManager.set('llmProvider.performanceMonitoring', {
    enabled: true,
    collectMetrics: true,
    optimizationSuggestions: true,
  });

  console.log(chalk.green('  ✅ Enabled CLI as default provider'));
  console.log(chalk.green('  ✅ Configured process pooling'));
  console.log(chalk.green('  ✅ Enabled performance monitoring'));
  console.log(chalk.green('  ✅ Optimized for your account type'));
}

export default setupCliCommand;