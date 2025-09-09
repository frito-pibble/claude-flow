/**
 * CLI Error Help System
 * Provides contextual help and troubleshooting guidance for CLI errors
 */

import {
  CLIError,
  CLIErrorHandler,
  getCLIGuidanceTemplate,
  CLI_ERROR_TEMPLATES,
  isCLIError,
  getCLIErrorCode,
} from '../../utils/cli-error-handling.js';
import { getCLIDetector } from '../../utils/cli-detection.js';

/**
 * Enhanced CLI error help that integrates with existing CLI system
 */
export class CLIErrorHelp {
  /**
   * Get contextual help for CLI errors during command execution
   */
  static async getErrorHelp(error: unknown, command?: string): Promise<string> {
    const lines: string[] = [];
    
    // Add command context if available
    if (command) {
      lines.push(`❌ Error in command: ${command}`);
      lines.push('');
    }

    // Handle CLI-specific errors
    if (isCLIError(error)) {
      try {
        const formattedMessage = await CLIErrorHandler.formatUserMessage(error, true);
        lines.push(formattedMessage);
      } catch (formattingError) {
        lines.push(`Error: ${error.message}`);
        lines.push('');
        lines.push('⚠️  Unable to get detailed troubleshooting guidance');
      }
    } else {
      // Map non-CLI errors to CLI errors for consistent guidance
      const mappedError = CLIErrorHandler.mapSubprocessError(
        error instanceof Error ? error : new Error(String(error)),
        undefined,
        undefined,
        command
      );
      
      try {
        const formattedMessage = await CLIErrorHandler.formatUserMessage(mappedError, true);
        lines.push(formattedMessage);
      } catch (formattingError) {
        lines.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
        lines.push('');
        lines.push(getCLIGuidanceTemplate('SETUP_GUIDANCE'));
      }
    }

    // Add command-specific help if available
    const commandHelp = this.getCommandSpecificHelp(command, error);
    if (commandHelp) {
      lines.push('');
      lines.push(commandHelp);
    }

    return lines.join('\n');
  }

  /**
   * Get command-specific troubleshooting help
   */
  private static getCommandSpecificHelp(command?: string, error?: unknown): string | null {
    if (!command) return null;

    switch (command) {
      case 'doctor':
        return this.getDoctorCommandHelp();
      case 'setup-cli':
        return this.getSetupCommandHelp();
      case 'provider':
        return this.getProviderCommandHelp();
      case 'migrate-api':
        return this.getMigrateCommandHelp(error);
      default:
        return null;
    }
  }

  /**
   * Help for 'claude-flow doctor' command
   */
  private static getDoctorCommandHelp(): string {
    return [
      '🩺 Doctor Command Help',
      '',
      'The doctor command checks your Claude CLI setup:',
      '• CLI installation and version',
      '• Authentication status',
      '• Pro account features',
      '• Network connectivity',
      '',
      'If doctor fails:',
      '1. Ensure Claude CLI is installed and in PATH',
      '2. Check internet connection',
      '3. Verify Claude CLI permissions',
      '4. Try reinstalling Claude CLI if issues persist',
    ].join('\n');
  }

  /**
   * Help for 'claude-flow setup-cli' command
   */
  private static getSetupCommandHelp(): string {
    return [
      '🚀 Setup Command Help',
      '',
      'The setup-cli command guides you through CLI configuration:',
      '• Detects current CLI status',
      '• Provides step-by-step setup instructions',
      '• Configures optimal settings for your account',
      '• Tests the configuration after setup',
      '',
      'Setup process:',
      '1. CLI installation verification',
      '2. Authentication setup',
      '3. Configuration optimization',
      '4. Validation testing',
      '',
      'Requirements:',
      '• Claude CLI installed from https://claude.ai/downloads',
      '• Valid Anthropic account',
      '• Internet connection for authentication',
    ].join('\n');
  }

  /**
   * Help for 'claude-flow provider' command
   */
  private static getProviderCommandHelp(): string {
    return [
      '⚙️  Provider Command Help',
      '',
      'The provider command manages your LLM provider settings:',
      '• Shows current provider configuration',
      '• Displays provider status and capabilities',
      '• Provides optimization recommendations',
      '• Allows switching between providers',
      '',
      'Provider types:',
      '• claude-code: Uses Claude CLI (recommended for Pro users)',
      '• anthropic: Direct API access (requires API key)',
      '• openai: OpenAI API integration',
      '• Other providers as configured',
      '',
      'CLI Provider benefits:',
      '• No API key required',
      '• Leverages Pro account features',
      '• Enhanced reliability and error handling',
      '• Better cost control',
    ].join('\n');
  }

  /**
   * Help for 'claude-flow migrate-api' command
   */
  private static getMigrateCommandHelp(error?: unknown): string {
    const baseHelp = [
      '🔄 Migration Command Help',
      '',
      'The migrate-api command helps transition from API to CLI mode:',
      '• Analyzes current API configuration',
      '• Plans migration steps',
      '• Backs up existing configuration',
      '• Migrates to CLI-based setup',
      '• Validates new configuration',
      '',
      'Migration benefits:',
      '• No API key management needed',
      '• Better error handling and reliability',
      '• Pro account feature access',
      '• Simplified authentication',
    ];

    // Add error-specific guidance
    if (error && isCLIError(error)) {
      const errorCode = getCLIErrorCode(error);
      switch (errorCode) {
        case 'CLI_NOT_INSTALLED':
          baseHelp.push('', '⚠️  Migration requires Claude CLI to be installed first!');
          baseHelp.push('Run "claude-flow setup-cli" before attempting migration.');
          break;
        case 'CLI_AUTH_ERROR':
          baseHelp.push('', '⚠️  Migration requires CLI authentication!');
          baseHelp.push('Run "claude auth login" before attempting migration.');
          break;
      }
    }

    return baseHelp.join('\n');
  }

  /**
   * Get general CLI troubleshooting help
   */
  static getGeneralTroubleshootingHelp(): string {
    return [
      '🔧 General CLI Troubleshooting',
      '',
      '1. **Installation Issues**',
      '   • Download from https://claude.ai/downloads',
      '   • Ensure CLI is in your system PATH',
      '   • Restart terminal after installation',
      '',
      '2. **Authentication Issues**',
      '   • Run "claude auth login"',
      '   • Verify Anthropic account credentials',
      '   • Check Pro subscription status',
      '   • Clear auth cache if needed: "claude auth logout"',
      '',
      '3. **Permission Issues**',
      '   • Check file/directory permissions',
      '   • Ensure antivirus isn\'t blocking CLI',
      '   • Try running from different directory',
      '   • Avoid sudo unless absolutely necessary',
      '',
      '4. **Network Issues**',
      '   • Check internet connection',
      '   • Verify firewall settings',
      '   • Configure proxy if behind corporate network',
      '   • Test with "claude doctor"',
      '',
      '5. **Performance Issues**',
      '   • Enable CLI process pooling',
      '   • Increase timeout settings',
      '   • Monitor system resources',
      '   • Break large requests into smaller chunks',
      '',
      '📞 **Getting Help**',
      '   • Run "claude-flow doctor" for diagnostics',
      '   • Check logs for detailed error information',
      '   • Visit documentation at https://claude.ai/docs',
      '   • Report persistent issues to support',
    ].join('\n');
  }

  /**
   * Get quick reference for common CLI commands
   */
  static getCommandReference(): string {
    return [
      '📋 CLI Command Reference',
      '',
      '**Diagnostic Commands:**',
      '• claude-flow doctor        - Check CLI health and configuration',
      '• claude doctor             - Check Claude CLI status',
      '• claude --version          - Show CLI version',
      '',
      '**Setup Commands:**',
      '• claude-flow setup-cli     - Guided CLI setup and configuration',
      '• claude auth login         - Authenticate with Claude CLI',
      '• claude auth logout        - Clear authentication',
      '',
      '**Configuration Commands:**',
      '• claude-flow provider      - Manage provider settings',
      '• claude-flow migrate-api   - Migrate from API to CLI mode',
      '• claude config list        - Show Claude CLI configuration',
      '',
      '**Usage Commands:**',
      '• claude -p "prompt"        - Basic completion',
      '• claude -p --model sonnet  - Use specific model',
      '• claude -p --json          - JSON output format',
      '',
      '**Help Commands:**',
      '• claude-flow --help        - Show available commands',
      '• claude --help             - Show Claude CLI help',
      '• claude-flow <command> -h  - Command-specific help',
    ].join('\n');
  }

  /**
   * Create formatted error summary for CLI output
   */
  static formatErrorSummary(error: unknown, includeHelp = true): string {
    const lines: string[] = [];
    
    if (isCLIError(error)) {
      lines.push(`❌ ${error.message}`);
      if (error.cliCode) {
        lines.push(`   Code: ${error.cliCode}`);
      }
    } else {
      lines.push(`❌ ${error instanceof Error ? error.message : String(error)}`);
    }

    if (includeHelp) {
      lines.push('');
      lines.push('💡 Run "claude-flow doctor" to diagnose CLI issues');
      lines.push('💡 Run "claude-flow --help" for available commands');
      lines.push('💡 Use "--json" flag for machine-readable output');
    }

    return lines.join('\n');
  }

  /**
   * Check if CLI is in a recoverable state and provide recovery guidance
   */
  static async getRecoveryGuidance(): Promise<string> {
    const lines: string[] = [];
    lines.push('🔄 CLI Recovery Guidance');
    lines.push('');

    try {
      const detector = getCLIDetector();
      const isInstalled = await detector.isCLIInstalled();
      
      if (!isInstalled) {
        lines.push('❌ Claude CLI is not installed');
        lines.push('');
        lines.push('Recovery steps:');
        lines.push('1. Install Claude CLI from https://claude.ai/downloads');
        lines.push('2. Add CLI to your system PATH');
        lines.push('3. Restart your terminal');
        lines.push('4. Run "claude --version" to verify installation');
        lines.push('5. Run "claude-flow setup-cli" to configure');
      } else {
        const isAuthenticated = await detector.isCLIAuthenticated();
        
        if (!isAuthenticated) {
          lines.push('⚠️  Claude CLI is installed but not authenticated');
          lines.push('');
          lines.push('Recovery steps:');
          lines.push('1. Run "claude auth login"');
          lines.push('2. Follow authentication prompts');
          lines.push('3. Verify with "claude doctor"');
          lines.push('4. Run "claude-flow setup-cli" to optimize configuration');
        } else {
          lines.push('✅ Claude CLI appears to be properly installed and authenticated');
          lines.push('');
          lines.push('If you\'re still experiencing issues:');
          lines.push('1. Try clearing CLI cache');
          lines.push('2. Restart your terminal session');
          lines.push('3. Check for CLI updates');
          lines.push('4. Verify network connectivity');
          lines.push('5. Report persistent issues to support');
        }
      }
    } catch (detectionError) {
      lines.push('⚠️  Unable to detect CLI status');
      lines.push('');
      lines.push('This may indicate installation or permission issues.');
      lines.push('');
      lines.push('Recovery steps:');
      lines.push('1. Verify Claude CLI installation');
      lines.push('2. Check PATH environment variable');
      lines.push('3. Ensure proper file permissions');
      lines.push('4. Try reinstalling Claude CLI');
      lines.push('5. Contact support if issues persist');
    }

    return lines.join('\n');
  }
}