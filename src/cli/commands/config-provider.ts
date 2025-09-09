#!/usr/bin/env node

import chalk from 'chalk';
import { ConfigManager } from '../../config/config-manager.js';
import { CLIDetector } from '../../utils/cli-detection.js';
import type { Command, CommandContext } from '../cli-core.js';

export const configProviderCommand: Command = {
  name: 'provider',
  description: 'Show and configure LLM provider settings',
  options: [
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

      if (ctx.flags.json) {
        const config = await configManager.getLLMProviderConfig();
        const health = await detector.runHealthCheck();
        console.log(JSON.stringify({
          currentConfig: config,
          cliStatus: health
        }, null, 2));
        return;
      }

      await displayProviderStatus(configManager, detector);

    } catch (error) {
      if (ctx.flags.json) {
        console.log(JSON.stringify({ 
          error: (error as Error).message 
        }, null, 2));
      } else {
        console.error(chalk.red('❌ Failed to get provider configuration:'), (error as Error).message);
      }
      process.exit(1);
    }
  },
};

// Note: This command shows provider status only
// In the future, subcommands could be handled through ctx.args parsing

async function displayProviderStatus(configManager: ConfigManager, detector: CLIDetector) {
  console.log(chalk.cyan.bold('🔧 LLM Provider Configuration'));
  console.log('─'.repeat(50));

  // Current configuration
  const config = await configManager.getLLMProviderConfig();
  console.log(chalk.cyan('\n📋 Current Settings:'));
  console.log(`Default Provider: ${chalk.yellow(config?.defaultProvider || 'not set')}`);
  console.log(`Auto Selection: ${chalk.yellow(config?.enableAutoSelection ? 'enabled' : 'disabled')}`);
  console.log(`Prefer CLI: ${chalk.yellow(config?.preferCLI ? 'yes' : 'no')}`);

  // CLI status and configuration
  console.log(chalk.cyan('\n🖥️  CLI Provider Status:'));
  const health = await detector.runHealthCheck();
  console.log(`Available: ${health.available ? chalk.green('✅') : chalk.red('❌')}`);
  console.log(`Authenticated: ${health.authenticated ? chalk.green('✅') : chalk.red('❌')}`);
  console.log(`Pro Account: ${health.hasProAccount ? chalk.green('✅') : chalk.yellow('⚠️')}`);

  if (health.available) {
    const cliConfig = await configManager.getCLIConfig();
    console.log(chalk.cyan('\n⚙️  CLI Configuration:'));
    console.log(`Pool Size: ${chalk.yellow(cliConfig?.processPoolSize || 'default')}`);
    console.log(`Timeout: ${chalk.yellow(cliConfig?.processTimeout || 'default')}ms`);
    console.log(`Max Concurrent: ${chalk.yellow(cliConfig?.maxConcurrentProcesses || 'default')}`);
    console.log(`Process Reuse: ${chalk.yellow(cliConfig?.enableProcessReuse ? 'enabled' : 'disabled')}`);
    console.log(`Health Caching: ${chalk.yellow(cliConfig?.cacheHealthChecks ? 'enabled' : 'disabled')}`);
  }

  // Fallback configuration
  const fallbackConfig = config?.fallback;
  console.log(chalk.cyan('\n🔄 Fallback Settings:'));
  console.log(`Enabled: ${chalk.yellow(fallbackConfig?.enabled ? 'yes' : 'no')}`);
  if (fallbackConfig?.providers) {
    console.log(`Order: ${chalk.yellow(fallbackConfig.providers.join(' → '))}`);
  }

  // Recommendations
  console.log(chalk.cyan('\n💡 Quick Commands:'));
  console.log(`${chalk.gray('Set CLI as default:')} npx claude-flow config provider set claude-code`);
  console.log(`${chalk.gray('Configure CLI settings:')} npx claude-flow config provider cli-config --help`);
  console.log(`${chalk.gray('Setup CLI:')} npx claude-flow setup-cli --auto-configure`);
  console.log(`${chalk.gray('Check health:')} npx claude-flow doctor`);
}

export default configProviderCommand;