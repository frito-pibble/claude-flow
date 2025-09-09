#!/usr/bin/env node

import chalk from 'chalk';
import { CLIDetector, HealthResult } from '../../utils/cli-detection.js';
import type { Command, CommandContext } from '../cli-core.js';

export const doctorCommand: Command = {
  name: 'doctor',
  description: 'Check Claude Code CLI availability and health status',
  options: [
    {
      name: 'detailed',
      description: 'Show detailed health information',
      type: 'boolean',
    },
    {
      name: 'json',
      description: 'Output as JSON',
      type: 'boolean',
    },
    {
      name: 'force-refresh',
      description: 'Force refresh health check cache',
      type: 'boolean',
    },
  ],
  action: async (ctx: CommandContext) => {
    try {
      const detector = new CLIDetector();
      
      if (!ctx.flags.json) {
        console.log(chalk.cyan.bold('🏥 Claude Code CLI Health Check'));
        console.log('─'.repeat(50));
      }

      // Force refresh if requested
      const health = await detector.runHealthCheck(ctx.flags['force-refresh'] as boolean);

      if (ctx.flags.json) {
        console.log(JSON.stringify(health, null, 2));
        return;
      }

      // Display results
      displayHealthResults(health, ctx.flags.detailed as boolean);

      // Exit with appropriate code
      if (!health.available || !health.authenticated) {
        process.exit(1);
      }

    } catch (error) {
      if (ctx.flags.json) {
        console.log(JSON.stringify({ 
          error: (error as Error).message,
          available: false,
          authenticated: false,
          hasProAccount: false
        }, null, 2));
      } else {
        console.error(chalk.red('❌ Health check failed:'), (error as Error).message);
      }
      process.exit(1);
    }
  },
};

function displayHealthResults(health: HealthResult, detailed: boolean) {
  // CLI Installation Status
  console.log(
    health.available 
      ? chalk.green('✅ Claude Code CLI: Installed') 
      : chalk.red('❌ Claude Code CLI: Not found')
  );

  if (!health.available) {
    console.log(chalk.yellow('\n📋 Setup Instructions:'));
    console.log('1. Install Claude Code CLI from: https://claude.ai/code');
    console.log('2. Run setup: claude login');
    console.log('3. Verify: claude doctor');
    return;
  }

  // Authentication Status
  console.log(
    health.authenticated 
      ? chalk.green('✅ Authentication: Authenticated') 
      : chalk.red('❌ Authentication: Not authenticated')
  );

  // Pro Account Status
  if (health.hasProAccount) {
    console.log(chalk.green('✅ Account: Pro subscription active'));
  } else {
    console.log(chalk.yellow('⚠️  Account: Free tier (Pro recommended for best experience)'));
  }

  // Version Information
  if (health.version) {
    console.log(chalk.blue(`ℹ️  Version: ${health.version}`));
  }

  // Detailed Information
  if (detailed) {
    console.log(chalk.cyan('\n🔍 Detailed Information:'));
    console.log(`Response Time: ${health.responseTime}ms`);
    console.log(`Last Checked: ${new Date(health.lastChecked).toLocaleString()}`);
    
    if (health.error) {
      console.log(chalk.red(`Error Details: ${health.error}`));
    }
  }

  // Recommendations
  if (!health.authenticated) {
    console.log(chalk.yellow('\n🛠️  To authenticate:'));
    console.log('1. Run: claude login');
    console.log('2. Follow the browser authentication flow');
    console.log('3. Verify: claude doctor');
  } else if (!health.hasProAccount) {
    console.log(chalk.yellow('\n💡 Pro Account Benefits:'));
    console.log('• No usage costs for claude-flow operations');
    console.log('• Higher rate limits and priority access');
    console.log('• Advanced features and integrations');
    console.log('• Upgrade at: https://claude.ai/upgrade');
  } else {
    console.log(chalk.green('\n🎉 All systems operational! Claude Code CLI is ready.'));
  }

  // Performance Status
  if (health.responseTime > 5000) {
    console.log(chalk.yellow('\n⚠️  Performance Notice: CLI response time is slow (>5s)'));
    console.log('Consider checking your network connection or CLI installation.');
  }
}

export default doctorCommand;