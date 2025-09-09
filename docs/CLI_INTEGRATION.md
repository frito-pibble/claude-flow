# Claude Code CLI Integration Guide

## Overview

Claude-Flow v2.0.0 introduces native **Claude Code CLI integration**, replacing direct Anthropic API usage with Claude Code CLI subprocess calls. This provides seamless integration with Pro account authentication, built-in reliability features, and zero API costs for Pro users.

## Benefits

### 🔑 **Authentication Benefits**
- **No API Keys Required**: Uses Claude Code CLI authentication
- **Pro Account Integration**: Automatic Pro account detection and benefits
- **Zero Setup**: Works with existing Claude Code authentication

### 💰 **Cost Benefits**
- **$0 API Costs**: Pro account users pay nothing for API usage
- **No Rate Limits**: Leverage Pro account rate limit benefits
- **No Usage Tracking**: No need to monitor API token consumption

### 🛡️ **Reliability Benefits**
- **Built-in Error Handling**: Claude Code CLI provides robust error handling
- **Automatic Retries**: CLI handles transient failures automatically
- **Session Management**: Persistent authentication across sessions

## How It Works

### Architecture

```
┌─────────────────────────────────┐
│        Claude-Flow v2.0.0       │
├─────────────────────────────────┤
│    ClaudeCodeProvider           │ 
│    (CLI Integration Layer)      │
├─────────────────────────────────┤
│    ClaudeCodeCLIClient          │
│    (Subprocess Management)      │
├─────────────────────────────────┤
│         Claude Code CLI         │
│       (claude -p commands)      │
├─────────────────────────────────┤
│      Pro Account Backend        │
│      (Anthropic Services)       │
└─────────────────────────────────┘
```

### CLI Command Usage

Claude-Flow uses these Claude Code CLI commands internally:

```bash
# Basic completion
claude -p --output-format json "Your prompt here"

# Streaming responses
claude -p --output-format stream-json "Your prompt here"

# Model selection
claude -p --model sonnet "Your prompt here"

# System prompt
claude -p --append-system-prompt "System context" "Your prompt"

# Health check
claude doctor
```

## Prerequisites

### 1. Claude Code Installation

```bash
# Install Claude Code globally
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version
```

### 2. Authentication

```bash
# Authenticate with your Anthropic account
claude auth login

# Verify Pro account status
claude doctor
```

### 3. Pro Account (Recommended)

- **Required for zero costs**: Free tier users still incur API costs
- **Better rate limits**: Pro accounts have higher rate limits
- **Enhanced features**: Access to latest models and features

## Provider Configuration

### Automatic Configuration (Default)

Claude-Flow automatically detects and configures CLI integration:

```javascript
// Default configuration (automatic)
const provider = new ClaudeCodeProvider({
  preferCLI: true,           // Always prefer CLI when available
  fallbackToAPI: false,     // No auto-fallback (user decides)
  timeout: 30000,           // 30 second timeout
  enableProcessReuse: true, // Reuse processes for performance
});
```

### Manual Configuration

```javascript
// Advanced configuration
const config = {
  llmProvider: {
    type: 'claude-code',
    priority: 1,              // Highest priority
    cliOptions: {
      preferCLI: true,
      timeout: 60000,         // 60 second timeout  
      maxConcurrent: 3,       // Max concurrent processes
      poolSize: 5,            // Process pool size
      authCheckInterval: 300000, // Check auth every 5 minutes
      enableProcessReuse: true,
      cacheHealthChecks: true,
      fallbackToAPI: false    // User decides on errors
    },
    costLimits: {
      maxCostPerRequest: 0,   // $0 for Pro accounts
      dailyBudget: 0          // Unlimited for Pro accounts
    }
  }
};
```

## Usage Examples

### Basic Usage

```javascript
// Using the provider manager (automatic CLI selection)
const providerManager = new ProviderManager();
const response = await providerManager.sendMessage({
  content: "Hello, how can you help me?",
  model: "claude-3-sonnet"
});
```

### Direct Provider Usage

```javascript
// Using CLI provider directly
const provider = new ClaudeCodeProvider();

// Check availability
const isAvailable = await provider.isAvailable();
if (!isAvailable) {
  console.log('CLI provider not available - check authentication');
  return;
}

// Send message
const response = await provider.sendMessage({
  content: "Write a hello world function in JavaScript",
  model: "claude-3-sonnet"
});
```

### Streaming Responses

```javascript
// Stream responses for real-time output
const stream = await provider.sendMessage({
  content: "Explain quantum computing",
  model: "claude-3-sonnet",
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
```

## CLI Detection and Health

### Availability Detection

```javascript
import { createCLIDetector } from '../utils/cli-detection.js';

const detector = createCLIDetector();

// Check CLI installation
const isInstalled = await detector.isCLIInstalled();

// Check authentication
const isAuthenticated = await detector.isCLIAuthenticated();

// Check Pro account
const hasProAccount = await detector.hasProAccount();

// Full health check
const healthResult = await detector.runHealthCheck();
console.log('CLI Status:', healthResult);
```

### Setup Guidance

```javascript
// Get step-by-step setup instructions
const guidance = await detector.getSetupGuidance();
guidance.steps.forEach(step => console.log(`${step.order}: ${step.instruction}`));
```

## Error Handling

### CLI Error Types

Claude-Flow provides comprehensive error handling for CLI integration:

```javascript
import { 
  CLINotInstalledError, 
  CLIAuthenticationError,
  CLIPermissionError,
  CLITimeoutError,
  CLIProcessError 
} from '../utils/cli-error-handling.js';

try {
  const response = await provider.sendMessage(message);
} catch (error) {
  if (error instanceof CLINotInstalledError) {
    console.log('Please install Claude Code CLI first');
    console.log('Run: npm install -g @anthropic-ai/claude-code');
  } else if (error instanceof CLIAuthenticationError) {
    console.log('Please authenticate with Claude Code');
    console.log('Run: claude auth login');
  } else if (error instanceof CLITimeoutError) {
    console.log('CLI request timed out - try increasing timeout');
  }
  // Provider gives clear guidance, no automatic fallbacks
}
```

### User Guidance Approach

Claude-Flow follows a **user-guided error handling** approach:

- **No Automatic Fallbacks**: Errors don't automatically fall back to API
- **Clear Error Messages**: Specific guidance for each error type
- **User Decision**: Users decide how to handle CLI failures
- **Recovery Instructions**: Step-by-step resolution guidance

## Performance Optimization

### Process Pooling

```javascript
// Enable process pooling for better performance
const config = {
  cliOptions: {
    enableProcessReuse: true,
    poolSize: 5,              // Keep 5 processes warm
    maxProcessLifetime: 300000, // Recycle after 5 minutes
    idleTimeout: 60000        // Close idle processes after 1 minute
  }
};
```

### Concurrent Requests

```javascript
// Handle multiple concurrent requests efficiently
const promises = messages.map(message => 
  provider.sendMessage(message)
);

const responses = await Promise.all(promises);
```

### Performance Monitoring

```javascript
import { CLIPerformanceMonitor } from '../utils/cli-performance.js';

const monitor = new CLIPerformanceMonitor();

// Track performance metrics
monitor.startTracking();

// Your CLI operations here...

const metrics = monitor.getMetrics();
console.log('CLI Performance:', {
  averageResponseTime: metrics.averageResponseTime,
  successRate: metrics.successRate,
  memoryUsage: metrics.memoryUsage
});
```

## Diagnostic Commands

### Available Commands

```bash
# Check CLI health and status
claude-flow doctor

# Guide through CLI setup process
claude-flow setup-cli

# Show current provider configuration
claude-flow provider status

# Migrate from API to CLI configuration
claude-flow migrate-api
```

### Doctor Command Output

```bash
$ claude-flow doctor

🔍 Claude Code CLI Integration Health Check

✅ Claude Code CLI installed (version 1.2.3)
✅ Authentication configured  
✅ Pro account detected
✅ Provider manager configured for CLI-first
⚠️ Process pool disabled (enable for better performance)

📊 Performance Summary:
  • Average response time: 1.2s
  • Success rate: 99.8%
  • Memory usage: 45MB
  • Grade: A-

🎯 Recommendations:
  • Enable process pooling for 30% faster responses
  • Consider increasing concurrent limits for batch operations
```

## Migration from API

### Automatic Migration

```bash
# Migrate existing API configuration to CLI
claude-flow migrate-api

# Options
claude-flow migrate-api --backup --dry-run  # Test migration first
claude-flow migrate-api --force             # Force migration
```

### Manual Migration Steps

1. **Backup Current Configuration**:
   ```bash
   cp config/providers.json config/providers.json.backup
   ```

2. **Install and Authenticate CLI**:
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude auth login
   ```

3. **Update Provider Configuration**:
   ```javascript
   // Before (API)
   {
     "type": "anthropic",
     "apiKey": "sk-ant-..."
   }
   
   // After (CLI)
   {
     "type": "claude-code",
     "preferCLI": true,
     "fallbackToAPI": false
   }
   ```

4. **Test Configuration**:
   ```bash
   claude-flow doctor
   claude-flow provider status
   ```

## Advanced Features

### Model Selection

```javascript
// Use specific models
const models = provider.getSupportedModels();
console.log('Available models:', models);

// Send with specific model
const response = await provider.sendMessage({
  content: "Your prompt",
  model: "claude-3-opus"  // or "claude-3-sonnet", "claude-3-haiku"
});
```

### Custom Configuration

```javascript
// Create custom CLI configuration
const customConfig = {
  timeout: 120000,          // 2 minute timeout
  maxRetries: 3,            // Retry failed requests
  retryDelay: 1000,        // Wait 1s between retries
  enableStreaming: true,    // Support streaming responses
  logLevel: 'debug'        // Detailed logging
};

const provider = new ClaudeCodeProvider(customConfig);
```

### Integration with Existing Code

```javascript
// Drop-in replacement for existing API provider
// No code changes required - same interface
const provider = process.env.USE_CLI 
  ? new ClaudeCodeProvider() 
  : new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY });

// Same usage pattern
const response = await provider.sendMessage(message);
```

## Troubleshooting

### Common Issues

#### CLI Not Found
```
Error: CLI not installed
Solution: npm install -g @anthropic-ai/claude-code
```

#### Authentication Failure
```
Error: CLI authentication failed
Solution: claude auth login
```

#### Permission Denied
```
Error: Permission denied accessing Claude CLI
Solution: Check file permissions and user account
```

#### Timeout Issues
```
Error: CLI request timed out
Solution: Increase timeout in configuration or check network
```

### Debug Mode

```javascript
// Enable debug logging
const provider = new ClaudeCodeProvider({
  logLevel: 'debug',
  enableDebugOutput: true
});

// Or set environment variable
process.env.CLAUDE_FLOW_LOG_LEVEL = 'debug';
```

### Performance Issues

```bash
# Analyze CLI performance
claude-flow doctor --performance-analysis

# Check process pool status
claude-flow provider status --processes

# Test concurrent performance
claude-flow doctor --concurrent-test
```

## Best Practices

### 1. **Use Process Pooling**
Enable process pooling for applications with multiple CLI requests:

```javascript
const config = {
  cliOptions: {
    enableProcessReuse: true,
    poolSize: 3  // Adjust based on concurrency needs
  }
};
```

### 2. **Handle Errors Gracefully**
Always handle CLI errors with user guidance:

```javascript
try {
  const response = await provider.sendMessage(message);
} catch (error) {
  // Provide clear next steps, no automatic fallbacks
  console.error('CLI Error:', error.message);
  console.log('Troubleshooting:', error.guidance);
}
```

### 3. **Monitor Performance**
Track CLI performance for optimization:

```javascript
// Log performance metrics periodically
setInterval(() => {
  const metrics = provider.getPerformanceMetrics();
  if (metrics.averageResponseTime > 5000) {
    console.warn('CLI performance degradation detected');
  }
}, 60000);
```

### 4. **Validate Configuration**
Always validate CLI setup in production:

```javascript
// Startup validation
const detector = createCLIDetector();
const health = await detector.runHealthCheck();

if (!health.overall.status === 'healthy') {
  throw new Error(`CLI setup invalid: ${health.overall.issues.join(', ')}`);
}
```

### 5. **Use Appropriate Timeouts**
Set timeouts based on expected operation duration:

```javascript
const config = {
  timeout: 30000,     // 30s for normal requests  
  streamTimeout: 120000, // 2m for streaming
  longTimeout: 300000    // 5m for complex tasks
};
```

## Security Considerations

### 1. **No API Keys in Code**
CLI integration eliminates API key management:
- No keys to rotate or secure
- No accidental key exposure in logs
- Centralized authentication through Claude Code

### 2. **Process Isolation**
Each CLI call runs in isolated subprocess:
- Memory isolation between requests
- Process-level security boundaries
- Automatic cleanup of resources

### 3. **Audit Trail**
CLI integration provides audit capabilities:
- All requests logged through Claude Code
- Authentication audit trail
- Usage analytics through Pro account

## Conclusion

Claude Code CLI integration provides a robust, cost-effective, and secure way to integrate Claude AI capabilities into your applications. With automatic Pro account detection, comprehensive error handling, and performance optimizations, it offers significant advantages over direct API integration.

For questions or issues, see:
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Migration Guide](./MIGRATION_GUIDE.md)
- [GitHub Issues](https://github.com/ruvnet/claude-flow/issues)