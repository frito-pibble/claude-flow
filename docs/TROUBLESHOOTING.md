# Claude Code CLI Integration - Troubleshooting Guide

## Quick Diagnostics

### Run Health Check
```bash
# Comprehensive health check
claude-flow doctor

# Check CLI provider status  
claude-flow provider status

# JSON output for programmatic use
claude-flow doctor --json
```

## Common Issues & Solutions

### 1. CLI Not Installed or Not Found

**Symptoms:**
- `command not found: claude`
- CLI availability checks fail
- Provider selection falls back to API

**Solutions:**
1. **Install Claude Code CLI:**
   ```bash
   # Follow installation guide at:
   # https://claude.ai/code
   ```

2. **Check PATH configuration:**
   ```bash
   which claude
   echo $PATH
   ```

3. **Verify installation:**
   ```bash
   claude doctor
   ```

### 2. Authentication Issues

**Symptoms:**
- `Authentication required` errors
- CLI commands fail with auth errors
- Provider reports CLI unavailable despite installation

**Solutions:**

#### Not Authenticated
```bash
# Authenticate with Claude Code
claude auth

# Verify authentication
claude doctor
```

#### Session Expired
```bash
# Re-authenticate
claude auth logout
claude auth
```

#### Pro Account Issues
```bash
# Check account status
claude account status

# Ensure Pro subscription is active
# Visit https://claude.ai/settings/billing
```

### 3. Permission and Access Issues

**Symptoms:**
- `Permission denied` errors
- CLI subprocess fails to execute
- Timeout during CLI operations

**Solutions:**

#### macOS/Linux Permission Issues
```bash
# Check CLI permissions
ls -la $(which claude)

# Fix permissions if needed
chmod +x $(which claude)
```

#### Windows Permission Issues
```cmd
# Run as administrator
# Check Windows Defender exclusions
# Verify PATH in system environment variables
```

### 4. Process Management Issues

**Symptoms:**
- Hanging CLI processes
- Memory usage growing over time
- Concurrent request failures

**Solutions:**

#### Kill Hanging Processes
```bash
# Find Claude processes
ps aux | grep claude

# Kill specific process
kill -9 <process_id>

# Kill all Claude processes (careful!)
pkill -f claude
```

#### Configure Process Limits
```javascript
// Update claude-flow configuration
{
  "llmProvider": {
    "cliOptions": {
      "poolSize": 3,           // Reduce concurrent processes
      "timeout": 30000,        // 30 second timeout
      "maxConcurrent": 5,      // Limit concurrent requests
      "enableProcessReuse": true
    }
  }
}
```

### 5. Performance Issues

**Symptoms:**
- Slow response times
- High CPU/memory usage
- Request timeouts

**Solutions:**

#### Enable Process Pooling
```javascript
{
  "llmProvider": {
    "cliOptions": {
      "enableProcessReuse": true,
      "poolSize": 5,
      "poolIdleTimeout": 30000
    }
  }
}
```

#### Adjust Timeouts
```javascript
{
  "llmProvider": {
    "cliOptions": {
      "timeout": 60000,        // 60 seconds
      "authCheckInterval": 300000  // 5 minutes
    }
  }
}
```

### 6. Network and Connectivity Issues

**Symptoms:**
- Network timeouts
- Connection refused errors
- Intermittent failures

**Solutions:**

#### Check Network Connectivity
```bash
# Test basic connectivity
curl -I https://claude.ai

# Check DNS resolution
nslookup claude.ai
```

#### Configure Proxy Settings
```bash
# Set proxy if needed
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080

# Or configure in CLI
claude config set proxy.http http://proxy.company.com:8080
```

### 7. Configuration Issues

**Symptoms:**
- CLI provider not being selected
- Incorrect model/parameter usage
- Configuration not taking effect

**Solutions:**

#### Reset Configuration
```bash
# Reset to defaults
claude-flow provider reset

# Migrate from API configuration
claude-flow migrate-api --dry-run
claude-flow migrate-api
```

#### Validate Configuration
```javascript
// Check current configuration
const config = require('./claude-flow.config.js');
console.log(JSON.stringify(config.llmProvider, null, 2));
```

## Error Code Reference

### CLI Exit Codes
- `0` - Success
- `1` - General error
- `2` - Authentication error
- `3` - Network error
- `4` - Permission denied
- `5` - Timeout
- `126` - Command not executable
- `127` - Command not found
- `130` - Interrupted by Ctrl+C

### Claude-Flow Error Types
- `CLINotInstalledError` - CLI not found in PATH
- `CLIAuthenticationError` - Authentication required/failed
- `CLIPermissionError` - Permission denied
- `CLITimeoutError` - Operation timed out
- `CLINetworkError` - Network connectivity issues
- `CLIProcessError` - Subprocess management error
- `CLIConfigurationError` - Configuration invalid

## Debug Mode

### Enable Debug Logging
```bash
# Environment variable
export DEBUG=claude-flow:*

# Or in code
process.env.DEBUG = 'claude-flow:cli*';
```

### Verbose CLI Output
```bash
# Verbose CLI commands
claude -v doctor
claude --debug -p "test message"
```

### Performance Profiling
```javascript
// Enable performance monitoring
const { CLIPerformanceMonitor } = require('./src/utils/cli-performance');

const monitor = new CLIPerformanceMonitor();
monitor.startMonitoring();

// View metrics
console.log(monitor.getMetrics());
```

## Advanced Troubleshooting

### CLI Subprocess Debugging

#### Manual CLI Testing
```bash
# Test CLI manually
claude -p --output-format json "Hello, world!"

# Test streaming
claude -p --output-format stream-json "Count to 5"

# Test with specific model
claude -p --model sonnet "What is 2+2?"
```

#### Inspect Environment
```bash
# Check environment variables
env | grep -E "(PATH|CLAUDE|DEBUG)"

# Check shell configuration
echo $SHELL
cat ~/.bashrc ~/.zshrc
```

### Process Pool Debugging

#### Monitor Process Pool
```javascript
const { CLIProcessPool } = require('./src/utils/cli-performance');

const pool = new CLIProcessPool({ debug: true });
setInterval(() => {
  console.log('Pool stats:', pool.getStats());
}, 5000);
```

#### Memory Analysis
```javascript
const { analyzeMemoryUsage } = require('./src/utils/cli-performance');

async function debugMemory() {
  const analysis = await analyzeMemoryUsage();
  console.log('Memory analysis:', analysis);
}

setInterval(debugMemory, 10000);
```

## Integration-Specific Issues

### Provider Manager Issues

#### Provider Not Selected
```javascript
// Check provider availability
const { ProviderManager } = require('./src/providers/provider-manager');

const manager = new ProviderManager();
await manager.initialize();

console.log('Available providers:', manager.getAvailableProviders());
console.log('Selected provider:', await manager.selectProvider(request));
```

#### Configuration Override
```javascript
// Force CLI provider
{
  "llmProvider": {
    "type": "claude-code",
    "preferCLI": true,
    "fallbackToAPI": false
  }
}
```

### Migration Issues

#### Incomplete Migration
```bash
# Check migration status
claude-flow migrate-api --status

# Complete migration
claude-flow migrate-api --force
```

#### Rollback Migration
```bash
# Rollback to API provider
claude-flow migrate-api --rollback

# Restore backup
claude-flow migrate-api --restore-backup
```

## Performance Optimization Tips

### 1. Process Pool Configuration
```javascript
{
  "cliOptions": {
    "enableProcessReuse": true,
    "poolSize": 10,              // Optimal: CPU cores * 2
    "poolIdleTimeout": 30000,    // 30 seconds
    "processMaxLifetime": 300000 // 5 minutes
  }
}
```

### 2. Memory Management
```javascript
{
  "cliOptions": {
    "memoryLimit": "512MB",      // Limit per process
    "gcInterval": 60000,         // 1 minute
    "cleanupThreshold": 0.8      // 80% memory usage
  }
}
```

### 3. Request Batching
```javascript
// Batch requests for better performance
const requests = [...];
const results = await Promise.all(
  requests.map(req => provider.sendMessage(req))
);
```

## Getting Help

### Community Support
- **Issues**: [GitHub Issues](https://github.com/ruvnet/claude-flow/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ruvnet/claude-flow/discussions)
- **Documentation**: [Project Wiki](https://github.com/ruvnet/claude-flow/wiki)

### Reporting Bugs

Include the following information:
1. **System Information**:
   ```bash
   # OS and version
   uname -a
   
   # Node.js version  
   node --version
   
   # Claude CLI version
   claude --version
   
   # Claude-flow version
   npx claude-flow --version
   ```

2. **Debug Information**:
   ```bash
   # Run with debug enabled
   DEBUG=claude-flow:* claude-flow doctor --json
   ```

3. **Error Logs**:
   - Full error messages and stack traces
   - Configuration files (remove sensitive data)
   - Steps to reproduce the issue

### Enterprise Support

For enterprise users, additional support options:
- **Priority Support**: Contact your account manager
- **Professional Services**: Custom integration assistance
- **Training**: Team training and best practices

---

## Appendix

### Common Commands Reference
```bash
# Health and diagnostics
claude-flow doctor
claude-flow provider status
claude-flow setup-cli

# Migration
claude-flow migrate-api --dry-run
claude-flow migrate-api

# Configuration
claude-flow provider config
claude-flow provider reset

# CLI testing
claude doctor
claude -p "test message"
claude -p --model sonnet "hello"
```

### Configuration Template
```javascript
// claude-flow.config.js
module.exports = {
  llmProvider: {
    type: 'claude-code',
    preferCLI: true,
    fallbackToAPI: false,
    cliOptions: {
      enableProcessReuse: true,
      poolSize: 5,
      timeout: 30000,
      maxConcurrent: 10,
      authCheckInterval: 300000,
      cacheHealthChecks: true
    }
  }
};
```

This troubleshooting guide should help resolve most common issues with Claude Code CLI integration. For complex issues, enable debug logging and gather the diagnostic information specified above before seeking help.