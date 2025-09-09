/**
 * Comprehensive CLI Error Handling and User Messaging System
 * Maps subprocess errors to user-friendly messages with actionable guidance
 */

import { ClaudeFlowError } from './errors.js';
import { getCLIDetector } from './cli-detection.js';

/**
 * CLI-specific error types
 */
export class CLIError extends ClaudeFlowError {
  constructor(
    message: string,
    public readonly cliCode?: string,
    public readonly guidance?: string[],
    details?: unknown,
  ) {
    super(message, 'CLI_ERROR', details);
    this.name = 'CLIError';
  }
}

export class CLINotInstalledError extends CLIError {
  constructor(details?: unknown) {
    const guidance = [
      'Install Claude Code CLI from https://claude.ai/downloads',
      'Run "claude-flow setup-cli" for guided installation',
      'Verify installation with "claude doctor"',
      'Check PATH environment variable includes Claude CLI directory',
    ];
    super(
      'Claude Code CLI is not installed or not found in PATH',
      'CLI_NOT_INSTALLED',
      guidance,
      details,
    );
    this.name = 'CLINotInstalledError';
  }
}

export class CLIAuthenticationError extends CLIError {
  constructor(reason?: string, details?: unknown) {
    const guidance = [
      'Run "claude auth login" to authenticate',
      'Verify your Anthropic account credentials',
      'Check if you have a Pro account for full CLI features',
      'Try logging out and logging back in: "claude auth logout" then "claude auth login"',
      'Use "claude-flow setup-cli" for guided authentication setup',
    ];
    const message = reason 
      ? `Claude CLI authentication failed: ${reason}`
      : 'Claude CLI is not authenticated';
    super(message, 'CLI_AUTH_ERROR', guidance, details);
    this.name = 'CLIAuthenticationError';
  }
}

export class CLIPermissionError extends CLIError {
  constructor(operation: string, details?: unknown) {
    const guidance = [
      `Check file/directory permissions for: ${operation}`,
      'Run with appropriate user permissions (avoid sudo unless necessary)',
      'Verify write access to working directory',
      'Check if antivirus is blocking Claude CLI execution',
      'Try running from a different directory with full permissions',
    ];
    super(
      `Permission denied for CLI operation: ${operation}`,
      'CLI_PERMISSION_ERROR',
      guidance,
      details,
    );
    this.name = 'CLIPermissionError';
  }
}

export class CLITimeoutError extends CLIError {
  constructor(timeout: number, operation?: string, details?: unknown) {
    const guidance = [
      'Check your internet connection stability',
      'Try with a simpler/shorter prompt',
      `Increase timeout setting (current: ${timeout}ms)`,
      'Run "claude doctor" to check CLI health',
      'Consider breaking large requests into smaller parts',
    ];
    const message = operation 
      ? `CLI operation "${operation}" timed out after ${timeout}ms`
      : `CLI request timed out after ${timeout}ms`;
    super(message, 'CLI_TIMEOUT', guidance, details);
    this.name = 'CLITimeoutError';
  }
}

export class CLINetworkError extends CLIError {
  constructor(errorMessage: string, details?: unknown) {
    const guidance = [
      'Check your internet connection',
      'Verify firewall settings allow Claude CLI traffic',
      'Try connecting to a different network',
      'Check if you\'re behind a corporate proxy (configure proxy settings)',
      'Run "claude doctor" to test connectivity',
    ];
    super(
      `Network error in CLI operation: ${errorMessage}`,
      'CLI_NETWORK_ERROR',
      guidance,
      details,
    );
    this.name = 'CLINetworkError';
  }
}

export class CLIProcessError extends CLIError {
  constructor(exitCode: number, stderr?: string, details?: unknown) {
    const guidance = [
      'Check CLI process logs for detailed error information',
      'Verify Claude CLI version compatibility',
      'Try restarting with a fresh CLI session',
      'Run "claude doctor" to diagnose CLI health',
      'Report persistent issues to Claude support',
    ];
    const message = stderr 
      ? `CLI process failed (exit code ${exitCode}): ${stderr}`
      : `CLI process failed with exit code ${exitCode}`;
    super(message, 'CLI_PROCESS_ERROR', guidance, details);
    this.name = 'CLIProcessError';
  }
}

export class CLIVersionError extends CLIError {
  constructor(currentVersion?: string, requiredVersion?: string, details?: unknown) {
    const guidance = [
      'Update Claude CLI to the latest version',
      'Check https://claude.ai/downloads for version information',
      'Run "claude --version" to check current version',
      'Uninstall old version before installing new one',
      'Clear CLI cache after updating',
    ];
    const message = currentVersion && requiredVersion
      ? `CLI version ${currentVersion} is incompatible (requires ${requiredVersion}+)`
      : 'Claude CLI version is incompatible or too old';
    super(message, 'CLI_VERSION_ERROR', guidance, details);
    this.name = 'CLIVersionError';
  }
}

export class CLIConfigurationError extends CLIError {
  constructor(setting: string, details?: unknown) {
    const guidance = [
      `Check CLI configuration for setting: ${setting}`,
      'Reset CLI configuration: "claude config reset"',
      'Verify configuration file permissions',
      'Use "claude config list" to see current settings',
      'Run "claude-flow setup-cli" to reconfigure',
    ];
    super(
      `CLI configuration error for setting: ${setting}`,
      'CLI_CONFIG_ERROR',
      guidance,
      details,
    );
    this.name = 'CLIConfigurationError';
  }
}

/**
 * Error mapping and detection utilities
 */
export class CLIErrorHandler {
  private static readonly ERROR_PATTERNS = {
    notInstalled: [
      /command not found.*claude/i,
      /no such file or directory.*claude/i,
      /'claude' is not recognized/i,
      /cannot access.*claude/i,
    ],
    authentication: [
      /not authenticated/i,
      /authentication.*failed/i,
      /invalid.*api.*key/i,
      /unauthorized/i,
      /login.*required/i,
      /auth.*expired/i,
    ],
    permission: [
      /permission denied/i,
      /access denied/i,
      /eacces/i,
      /eperm/i,
      /insufficient.*permission/i,
    ],
    network: [
      /network.*error/i,
      /connection.*failed/i,
      /timeout/i,
      /enotfound/i,
      /econnrefused/i,
      /socket.*hang.*up/i,
    ],
    version: [
      /version.*incompatible/i,
      /version.*too.*old/i,
      /unsupported.*version/i,
      /upgrade.*required/i,
    ],
    configuration: [
      /config.*error/i,
      /invalid.*config/i,
      /missing.*config/i,
      /malformed.*config/i,
    ],
  };

  /**
   * Map subprocess error to appropriate CLI error with user guidance
   */
  static mapSubprocessError(
    error: Error | string,
    exitCode?: number,
    stderr?: string,
    operation?: string,
  ): CLIError {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const fullErrorText = `${errorMessage} ${stderr || ''}`.toLowerCase();

    // Check for specific error patterns
    if (this.matchesPatterns(fullErrorText, this.ERROR_PATTERNS.notInstalled)) {
      return new CLINotInstalledError({ originalError: error, exitCode, stderr });
    }

    if (this.matchesPatterns(fullErrorText, this.ERROR_PATTERNS.authentication)) {
      return new CLIAuthenticationError(errorMessage, { originalError: error, exitCode, stderr });
    }

    if (this.matchesPatterns(fullErrorText, this.ERROR_PATTERNS.permission)) {
      return new CLIPermissionError(operation || 'unknown', { originalError: error, exitCode, stderr });
    }

    if (this.matchesPatterns(fullErrorText, this.ERROR_PATTERNS.network)) {
      return new CLINetworkError(errorMessage, { originalError: error, exitCode, stderr });
    }

    if (this.matchesPatterns(fullErrorText, this.ERROR_PATTERNS.version)) {
      return new CLIVersionError(undefined, undefined, { originalError: error, exitCode, stderr });
    }

    if (this.matchesPatterns(fullErrorText, this.ERROR_PATTERNS.configuration)) {
      return new CLIConfigurationError(operation || 'unknown', { originalError: error, exitCode, stderr });
    }

    // Handle specific exit codes
    if (exitCode !== undefined) {
      switch (exitCode) {
        case 1:
          return new CLIAuthenticationError('CLI returned authentication error', { originalError: error, exitCode, stderr });
        case 2:
          return new CLIConfigurationError('Invalid CLI configuration', { originalError: error, exitCode, stderr });
        case 126:
          return new CLIPermissionError('CLI execution permission denied', { originalError: error, exitCode, stderr });
        case 127:
          return new CLINotInstalledError({ originalError: error, exitCode, stderr });
        case 130:
          return new CLITimeoutError(30000, operation, { originalError: error, exitCode, stderr });
      }
    }

    // Default to generic CLI process error
    return new CLIProcessError(exitCode || -1, stderr, { originalError: error });
  }

  /**
   * Check if error text matches any of the provided patterns
   */
  private static matchesPatterns(text: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(text));
  }

  /**
   * Get comprehensive troubleshooting guidance for CLI errors
   */
  static async getTroubleshootingGuidance(error: CLIError): Promise<string[]> {
    const baseGuidance = error.guidance || [];
    const contextualGuidance: string[] = [];

    // Add context-aware guidance based on CLI status
    try {
      const detector = getCLIDetector();
      const isInstalled = await detector.isCLIInstalled();
      const isAuthenticated = isInstalled ? await detector.isCLIAuthenticated() : false;

      if (!isInstalled) {
        contextualGuidance.push('❌ Claude CLI is not installed');
        contextualGuidance.push('→ Install from: https://claude.ai/downloads');
      } else if (!isAuthenticated) {
        contextualGuidance.push('❌ Claude CLI is installed but not authenticated');
        contextualGuidance.push('→ Run: claude auth login');
      } else {
        contextualGuidance.push('✅ Claude CLI appears to be properly installed and authenticated');
        contextualGuidance.push('→ This may be a temporary issue or configuration problem');
      }
    } catch (detectionError) {
      contextualGuidance.push('⚠️  Unable to detect CLI status - may indicate installation issues');
    }

    return [...contextualGuidance, '', '🔧 Suggested Actions:', ...baseGuidance];
  }

  /**
   * Create user-friendly error message with formatted guidance
   */
  static async formatUserMessage(error: CLIError, includeDetails = false): Promise<string> {
    const guidance = await this.getTroubleshootingGuidance(error);
    const lines = [
      `❌ ${error.message}`,
      '',
      ...guidance.map(line => line.startsWith('→') || line.startsWith('✅') || line.startsWith('❌') || line.startsWith('⚠️')
        ? `   ${line}`
        : line.startsWith('🔧') ? `\n${line}` : `   • ${line}`
      ),
    ];

    if (includeDetails && error.details) {
      lines.push('', '📋 Technical Details:', `   ${JSON.stringify(error.details, null, 2)}`);
    }

    return lines.join('\n');
  }
}

/**
 * Specific error message templates for common CLI scenarios
 */
export const CLI_ERROR_TEMPLATES = {
  SETUP_GUIDANCE: {
    title: '🚀 Claude CLI Setup Required',
    message: 'To use Claude Code integration, you need to set up the CLI first.',
    steps: [
      '1. Install Claude CLI from https://claude.ai/downloads',
      '2. Run "claude auth login" to authenticate',
      '3. Verify setup with "claude doctor"',
      '4. Use "claude-flow setup-cli" for guided configuration',
    ],
  },
  AUTH_GUIDANCE: {
    title: '🔐 Authentication Required',
    message: 'Your Claude CLI needs to be authenticated to work with claude-flow.',
    steps: [
      '1. Run "claude auth login" and follow the prompts',
      '2. Ensure you have a valid Anthropic account',
      '3. For Pro features, verify your account subscription',
      '4. Test authentication with "claude doctor"',
    ],
  },
  PERMISSION_GUIDANCE: {
    title: '🛡️  Permission Issue Detected',
    message: 'The Claude CLI doesn\'t have necessary permissions to execute.',
    steps: [
      '1. Check file/directory permissions in your working directory',
      '2. Ensure Claude CLI has execute permissions',
      '3. Avoid running with sudo unless absolutely necessary',
      '4. Check if antivirus software is blocking execution',
    ],
  },
  NETWORK_GUIDANCE: {
    title: '🌐 Network Connectivity Issue',
    message: 'Unable to connect to Claude services through the CLI.',
    steps: [
      '1. Check your internet connection',
      '2. Verify firewall settings allow CLI traffic',
      '3. If behind a proxy, configure CLI proxy settings',
      '4. Try connecting from a different network to isolate the issue',
    ],
  },
  PERFORMANCE_GUIDANCE: {
    title: '⚡ Performance Optimization',
    message: 'CLI operations are slower than expected.',
    steps: [
      '1. Enable process pooling in configuration',
      '2. Increase timeout settings for large requests',
      '3. Consider breaking large prompts into smaller chunks',
      '4. Monitor system resources (CPU, memory, network)',
    ],
  },
};

/**
 * Helper function to get template-based guidance
 */
export function getCLIGuidanceTemplate(templateKey: keyof typeof CLI_ERROR_TEMPLATES): string {
  const template = CLI_ERROR_TEMPLATES[templateKey];
  return [
    template.title,
    template.message,
    '',
    ...template.steps,
  ].join('\n');
}

/**
 * Check if an error is CLI-related
 */
export function isCLIError(error: unknown): error is CLIError {
  return error instanceof CLIError;
}

/**
 * Extract CLI error code for programmatic handling
 */
export function getCLIErrorCode(error: unknown): string | undefined {
  if (isCLIError(error)) {
    return error.cliCode;
  }
  return undefined;
}