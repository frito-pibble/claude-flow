# Claude Code CLI Integration - Implementation Tracker

## Project Overview
Replace claude-flow's direct Anthropic API usage with Claude Code CLI subprocess calls to leverage Pro account authentication and built-in reliability features.

## Implementation Status
- **Start Date**: 2025-09-08
- **Current Phase**: Planning Complete - Tasks Split for 120k Context
- **Overall Progress**: 2/14 tasks completed (14%)
- **Original Tasks**: 8 → **Optimized Tasks**: 14

---

## How to Use This Tracker

### Before Starting Each Task:
1. **🔍 Run Semantic Searches**: Each task lists required claude-context searches
2. **📖 Review Context**: Study the search results to understand existing code patterns
3. **✅ Check Dependencies**: Ensure previous tasks are completed
4. **📝 Update Status**: Mark task as "in_progress" when starting

### Semantic Search Instructions:
- Use the claude-context MCP server for all searches
- Run each search query listed in the task
- Study the results to understand existing patterns and interfaces
- Note file locations and key implementation details
- This replaces the need to manually read multiple files

### Example Search Usage:
```
"ClaudeAPIClient implementation and interface methods"
```
This will find all relevant API client code, interfaces, and methods across the codebase.

---

## ⚠️ Context Window Analysis

**Tasks 1-3**: ✅ Safe for 120k context  
**Tasks 4-8**: ⚠️ Need splitting for 120k context limits

### Recommended Task Adjustments:
- **Task 4**: Split into 4a (Provider Manager) + 4b (Config System)
- **Task 5**: Split into 5a (CLI Detection) + 5b (Performance Options)  
- **Task 6**: Split into 6a (New Commands) + 6b (Error Handling) + 6c (Existing Commands)
- **Task 7**: Split into 7a (Unit Tests) + 7b (Integration Tests) + 7c (E2E Tests)
- **Task 8**: Split into 8a (README/Migration) + 8b (Troubleshooting/Performance Docs)

**Result**: 8 tasks → 14 tasks (all safely within 120k context)

---

## Task Progress Tracker

### ✅ ❌ Task 1: Create CLI Wrapper Client with Subprocess Management
**Status**: ✅ Completed  
**Estimated Time**: 2-3 hours  
**Context**: Create a new client that wraps Claude Code CLI calls to replace direct API usage.

**🔍 Required Semantic Searches** (use claude-context):
1. "ClaudeAPIClient implementation and interface methods"
2. "API client error handling and response parsing"
3. "subprocess management and child process patterns"
4. "authentication and health check implementations"

**CLI Command Format Clarified**: 
- Basic completion: `claude -p "prompt"`
- JSON output: `claude -p --output-format json "prompt"`
- Streaming: `claude -p --output-format stream-json "prompt"`
- Model selection: `claude -p --model sonnet "prompt"`

**Key Implementation Details**:
1. **Primary Commands**:
   - Non-interactive: `claude -p --output-format json`
   - Streaming: `claude -p --output-format stream-json`
   - Model selection: `claude -p --model <model>`
   - Authentication check: `claude doctor`

2. **Subprocess Management**:
   - Use `child_process.spawn()` for non-blocking execution
   - Handle stdin/stdout/stderr streams properly
   - Implement timeout handling (60s default)
   - Handle process cleanup and error states

3. **Response Parsing**:
   - Parse JSON responses to match `ClaudeResponse` format
   - Handle streaming JSON responses
   - Map CLI errors to existing error classes
   - Extract usage information when available

**Files to create**:
- `src/api/claude-code-cli-client.ts`

**Acceptance Criteria**:
- [ ] CLI client executes basic completions
- [ ] Proper error handling for CLI failures
- [ ] Response format matches original API client
- [ ] Authentication detection works
- [ ] Process management is robust

**Notes**: 
- CLI uses `claude -p` for non-interactive mode
- JSON output format available for structured responses
- Need to handle both success and error exit codes

---

### ✅ ❌ Task 2: Implement Streaming Support and Response Parsing
**Status**: ✅ Completed  
**Estimated Time**: 1-2 hours  
**Dependencies**: Task 1 completed

**🔍 Required Semantic Searches** (use claude-context):
1. "streaming response handling and async iterables"
2. "JSON parsing and response format mapping"
3. "temperature and model parameter configuration"
4. "stream event handling and backpressure"

**Key Implementation Details**:
1. **Streaming Implementation**:
   - Use `--output-format stream-json` for real-time responses
   - Parse newline-delimited JSON events
   - Handle partial JSON parsing
   - Implement proper backpressure handling

2. **Response Format Mapping**:
   ```typescript
   // CLI JSON Response → ClaudeResponse mapping
   interface CLIResponse {
     content: string;
     model: string;
     usage?: { input_tokens: number; output_tokens: number };
   }
   ```

3. **Configuration Parameter Mapping**:
   - temperature → (not directly supported, document limitation)
   - max_tokens → (not directly supported, document limitation)  
   - model → `--model <model>`
   - system_prompt → `--append-system-prompt <prompt>`

**Files to modify**:
- `src/api/claude-code-cli-client.ts` (extend)

**Acceptance Criteria**:
- [ ] Streaming responses work correctly
- [ ] All response formats match original API
- [ ] Configuration parameters properly mapped
- [ ] Stream parsing is robust
- [ ] Error handling during streaming

**Notes**:
- CLI streaming uses newline-delimited JSON
- Some API parameters may not have CLI equivalents
- Document limitations vs API in implementation

---

### ✅ ❌ Task 3: Create CLI-Based Provider to Replace anthropic-provider
**Status**: ⏳ Pending  
**Estimated Time**: 2 hours  
**Dependencies**: Tasks 1-2 completed

**🔍 Required Semantic Searches** (use claude-context):
1. "BaseProvider class interface and required methods"
2. "AnthropicProvider implementation and capabilities"
3. "provider authentication and health check patterns"
4. "LLM provider types and configuration structure"

**Key Implementation Details**:
1. **Provider Interface Compatibility**:
   - Extend `BaseProvider` class
   - Implement all required methods from `AnthropicProvider`
   - Maintain same capabilities structure
   - Handle Pro account benefits (no usage costs)

2. **Capability Updates**:
   ```typescript
   readonly capabilities: ProviderCapabilities = {
     supportedModels: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
     requiresApiKey: false, // Key difference!
     usesProAccount: true,
     supportsCLIFeatures: true,
   };
   ```

3. **Authentication Handling**:
   - No API key required
   - Check CLI authentication status
   - Provide setup guidance if not authenticated
   - Handle Pro account detection

**Files to create**:
- `src/providers/claude-code-provider.ts`

**Acceptance Criteria**:
- [ ] Provider interface matches original exactly
- [ ] All methods work with CLI backend
- [ ] No API key required for operation
- [ ] Authentication detection and guidance works
- [ ] Pro account features properly handled

**Notes**:
- CLI provider should be preferred over API provider
- Need to handle CLI authentication failures gracefully
- Document Pro account benefits in provider capabilities

---

### ✅ ❌ Task 4a: Update Provider Manager System
**Status**: ⏳ Pending  
**Estimated Time**: 1 hour  
**Dependencies**: Task 3 completed

**🔍 Required Semantic Searches** (use claude-context):
1. "ProviderManager class and provider selection logic"
2. "provider instantiation and initialization patterns"

**Key Implementation Details**:
1. **Provider Selection Logic**:
   ```typescript
   // Priority: CLI > API (when both available)
   async selectProvider(): Promise<LLMProvider> {
     if (await this.isCLIAvailable()) {
       return 'claude-code';
     }
     return 'anthropic'; // fallback
   }
   ```

2. **Provider Manager Updates**:
   - Update provider instantiation logic
   - Handle provider switching
   - Add CLI availability checking
   - Update error messages

**Files to modify**:
- `src/providers/provider-manager.ts`
- `src/providers/index.ts`

**Acceptance Criteria**:
- [ ] Provider manager can instantiate CLI provider
- [ ] Automatic provider selection works
- [ ] Type safety maintained
- [ ] Error messages guide users to proper setup

**Notes**:
- CLI always takes priority when available
- Focus only on provider management logic

---

### ✅ ❌ Task 4b: Update Configuration and Type System
**Status**: ⏳ Pending  
**Estimated Time**: 45 minutes  
**Dependencies**: Task 4a completed

**🔍 Required Semantic Searches** (use claude-context):
1. "configuration management and provider types"
2. "configuration validation and type definitions"

**Key Implementation Details**:
1. **Configuration Updates**:
   - Add `claude-code` provider type
   - CLI-specific configuration options
   - Auto-detection settings
   - Migration helpers for existing configs

2. **Type System Updates**:
   - Add CLI provider types
   - Update provider capabilities interface
   - Add configuration validation

**Files to modify**:
- `src/providers/types.ts`
- `src/config/config-manager.ts`

**Acceptance Criteria**:
- [ ] Configuration system supports both modes
- [ ] Migration from API configs works
- [ ] Type safety maintained
- [ ] CLI-specific options available

**Notes**:
- Focus on configuration and types only
- Ensure backward compatibility

---

### ✅ ❌ Task 5a: CLI Detection and Authentication
**Status**: ⏳ Pending  
**Estimated Time**: 1 hour  
**Dependencies**: Task 4b completed

**🔍 Required Semantic Searches** (use claude-context):
1. "feature detection and availability checking patterns"
2. "health check and diagnostic implementations"

**Key Implementation Details**:
1. **CLI Detection Utility**:
   ```typescript
   class CLIDetector {
     async isCLIInstalled(): Promise<boolean>;
     async isCLIAuthenticated(): Promise<boolean>;
     async hasProAccount(): Promise<boolean>;
     async getCLIVersion(): Promise<string>;
     async runHealthCheck(): Promise<HealthResult>;
   }
   ```

2. **Authentication Detection**:
   - Run `claude doctor` to check health
   - Parse authentication status
   - Detect Pro account features
   - Provide setup guidance

3. **Fallback Logic**:
   - Auto-select CLI when available and authenticated
   - Fall back to API when CLI unavailable
   - Allow manual override via config
   - Handle mid-operation failures (user decides)

**Files to create**:
- `src/utils/cli-detection.ts`

**Acceptance Criteria**:
- [ ] Automatic CLI detection works reliably
- [ ] Authentication status properly detected
- [ ] Fallback logic works as specified
- [ ] Setup guidance provided when needed

**Notes**:
- Focus only on detection and authentication
- Keep performance optimization separate

---

### ✅ ❌ Task 5b: Performance Optimization and Monitoring
**Status**: ⏳ Pending  
**Estimated Time**: 1 hour  
**Dependencies**: Task 5a completed

**🔍 Required Semantic Searches** (use claude-context):
1. "performance monitoring and subprocess management"
2. "configuration migration and backward compatibility"

**Key Implementation Details**:
1. **Performance Options**:
   - CLI process pooling (reuse processes)
   - Subprocess timeout configuration
   - Memory usage monitoring
   - Performance comparison metrics

2. **Configuration Migration**:
   - Auto-migrate existing API configurations
   - Provide setup helpers for CLI mode
   - Add diagnostic commands

**Files to create**:
- `src/utils/cli-performance.ts`

**Files to modify**:
- `src/config/config-manager.ts`
- `src/providers/provider-manager.ts`

**Acceptance Criteria**:
- [ ] Performance options available
- [ ] Process pooling implemented
- [ ] Configuration migration works
- [ ] Memory monitoring functional

**Performance Options Implemented**:
- [ ] Process pooling for CLI calls
- [ ] Configurable timeouts
- [ ] Memory usage monitoring
- [ ] Subprocess overhead measurement

---

### ✅ ❌ Task 6a: Create New Diagnostic Commands
**Status**: ⏳ Pending  
**Estimated Time**: 45 minutes  
**Dependencies**: Task 5b completed

**🔍 Required Semantic Searches** (use claude-context):
1. "CLI command structure and main entry points"
2. "configuration and diagnostic command implementations"

**Key Implementation Details**:
1. **New CLI Commands**:
   - `claude-flow doctor` - Check CLI availability and health
   - `claude-flow setup-cli` - Guide CLI setup process
   - `claude-flow config provider` - Show/set provider mode
   - `claude-flow migrate-api` - Migrate from API to CLI mode

2. **Command Structure**:
   - Follow existing CLI patterns
   - Add proper help text
   - Include validation and error handling
   - Provide clear output format

**Files to create/modify**:
- `src/cli/commands/doctor.ts` (new)
- `src/cli/commands/setup-cli.ts` (new)
- `src/cli/main.ts` (add command registration)

**Acceptance Criteria**:
- [ ] All new commands work correctly
- [ ] Help text is clear and helpful
- [ ] Commands follow existing patterns
- [ ] Setup guidance is comprehensive

**Notes**:
- Focus only on new diagnostic commands
- Keep existing command updates separate

---

### ✅ ❌ Task 6b: Update Error Handling System
**Status**: ⏳ Pending  
**Estimated Time**: 45 minutes  
**Dependencies**: Task 6a completed

**🔍 Required Semantic Searches** (use claude-context):
1. "error handling patterns and user messaging"
2. "help text and command documentation patterns"

**Key Implementation Details**:
1. **Error Handling Updates**:
   - Map CLI subprocess errors to user-friendly messages
   - Provide troubleshooting for common CLI issues
   - Guide users through authentication setup
   - Handle permission and access issues

2. **User Messaging**:
   - Clear error descriptions
   - Actionable suggestions
   - No automatic fallbacks (user decides)
   - Link to setup guidance

**Files to modify**:
- Error handling utilities
- CLI error message constants
- Help text templates

**Acceptance Criteria**:
- [ ] Error messages are helpful and actionable
- [ ] Troubleshooting guidance is clear
- [ ] No automatic fallbacks implemented
- [ ] User has clear next steps

**Notes**:
- Error handling should not automatically fall back - let user decide
- Focus on messaging and guidance only

---

### ✅ ❌ Task 6c: Update Existing Commands for CLI Provider
**Status**: ⏳ Pending  
**Estimated Time**: 30 minutes  
**Dependencies**: Task 6b completed

**🔍 Required Semantic Searches** (use claude-context):
1. "existing command implementations and parameter handling"
2. "provider integration in CLI commands"

**Key Implementation Details**:
1. **Existing Command Updates**:
   - Ensure all commands work with CLI provider
   - Update parameter validation
   - Fix CLI-specific parameter limitations
   - Update help messages

2. **Parameter Handling**:
   - Map unsupported parameters properly
   - Provide warnings for CLI limitations
   - Update validation rules
   - Maintain backward compatibility

**Files to modify**:
- Existing command files in `src/cli/commands/`
- Parameter validation utilities

**Acceptance Criteria**:
- [ ] All existing commands work with CLI provider
- [ ] Parameter validation updated
- [ ] Help messages reflect CLI capabilities
- [ ] Existing functionality preserved

**Notes**:
- Focus only on existing command compatibility
- Document CLI parameter limitations

---

### ✅ ❌ Task 7a: Create Unit Tests
**Status**: ⏳ Pending  
**Estimated Time**: 1 hour  
**Dependencies**: Task 6c completed

**🔍 Required Semantic Searches** (use claude-context):
1. "existing test patterns and structure"
2. "API client testing and mocking patterns"

**Key Implementation Details**:
1. **Unit Test Coverage**:
   - CLI client basic functionality
   - Provider logic and configuration
   - Error handling and validation
   - Response parsing and formatting

2. **Test Structure**:
   ```typescript
   describe('ClaudeCodeCLIClient', () => {
     it('should parse CLI responses correctly', () => {
       // Test response parsing logic
     });
   });
   ```

**Files to create**:
- `tests/unit/api/claude-code-cli-client.test.ts`
- `tests/unit/providers/claude-code-provider.test.ts`

**Acceptance Criteria**:
- [ ] All unit tests pass
- [ ] Good test coverage for core logic
- [ ] Mock CLI interactions properly
- [ ] Test error conditions

**Notes**:
- Focus on testable logic without CLI dependencies
- Use mocks for CLI subprocess calls

---

### ✅ ❌ Task 7b: Create Integration Tests
**Status**: ⏳ Pending  
**Estimated Time**: 1 hour  
**Dependencies**: Task 7a completed

**🔍 Required Semantic Searches** (use claude-context):
1. "integration test setup and configuration"
2. "provider manager integration patterns"

**Key Implementation Details**:
1. **Integration Test Coverage**:
   - Provider manager with CLI provider
   - Configuration system integration
   - CLI detection and authentication
   - Process management and cleanup

2. **Real CLI Integration**:
   ```typescript
   describe('CLI Integration Tests', () => {
     beforeAll(async () => {
       // Verify CLI is installed and authenticated
       await expect(CLIDetector.isCLIAvailable()).resolves.toBe(true);
     });
   });
   ```

**Files to create**:
- `tests/integration/providers/cli-provider.test.ts`
- `tests/integration/utils/cli-detection.test.ts`

**Acceptance Criteria**:
- [ ] Integration tests with real CLI work
- [ ] Provider manager integration tested
- [ ] Tests skip gracefully when CLI unavailable
- [ ] CLI authentication properly tested

**Notes**:
- Requires working Claude Code CLI installation
- Tests should skip if CLI not available

---

### ✅ ❌ Task 7c: Create E2E and Performance Tests
**Status**: ⏳ Pending  
**Estimated Time**: 1 hour  
**Dependencies**: Task 7b completed

**🔍 Required Semantic Searches** (use claude-context):
1. "performance testing and benchmarking code"
2. "end-to-end test patterns and workflows"

**Key Implementation Details**:
1. **E2E Test Coverage**:
   - Full workflow with real CLI calls
   - Complete provider switching
   - Error handling end-to-end
   - User experience validation

2. **Performance Testing**:
   - Measure CLI subprocess overhead
   - Compare response times vs direct API
   - Memory usage analysis
   - Concurrent request handling

**Files to create**:
- `tests/e2e/cli-integration.test.ts`
- `tests/performance/cli-vs-api.test.ts`

**Acceptance Criteria**:
- [ ] E2E workflows function correctly
- [ ] Performance benchmarks available
- [ ] Memory usage monitored
- [ ] Concurrent handling tested

**Notes**:
- May need Pro account access
- Performance tests should provide comparison data
- Document CLI requirements for testing

---

### ✅ ❌ Task 8a: Update Core Documentation and Migration Guide
**Status**: ⏳ Pending  
**Estimated Time**: 1 hour  
**Dependencies**: Task 7c completed

**🔍 Required Semantic Searches** (use claude-context):
1. "existing documentation structure and patterns"
2. "configuration examples and setup guides"

**Key Implementation Details**:
1. **Documentation Updates**:
   - Update README with CLI integration overview
   - Add CLI setup requirements
   - Document Pro account benefits
   - Update installation instructions

2. **Migration Guide Content**:
   ```markdown
   # Migration from API to CLI Mode
   1. Install Claude Code CLI
   2. Authenticate with Pro account
   3. Update claude-flow configuration
   4. Verify functionality
   5. Remove API keys (optional)
   ```

**Files to create/modify**:
- `README.md` (update)
- `docs/CLI_INTEGRATION.md` (new)
- `docs/MIGRATION_GUIDE.md` (new)
- `CLAUDE.md` (update with CLI info)

**Acceptance Criteria**:
- [ ] README accurately reflects CLI integration
- [ ] Migration guide works step-by-step
- [ ] CLI setup requirements clear
- [ ] Pro account benefits documented

**Notes**:
- Focus on core documentation and migration
- Keep troubleshooting separate

---

### ✅ ❌ Task 8b: Create Troubleshooting and Performance Documentation
**Status**: ⏳ Pending  
**Estimated Time**: 1 hour  
**Dependencies**: Task 8a completed

**🔍 Required Semantic Searches** (use claude-context):
1. "troubleshooting and error handling documentation"
2. "CLI usage and command documentation patterns"

**Key Implementation Details**:
1. **Troubleshooting Guide**:
   - CLI installation issues
   - Authentication problems
   - Permission errors
   - Common error scenarios
   - Debugging subprocess issues

2. **Performance Documentation**:
   - CLI vs API performance comparison
   - Configuration options for performance
   - Best practices for CLI usage
   - Subprocess management details
   - Process pooling configuration

**Files to create**:
- `docs/TROUBLESHOOTING.md` (new)
- `docs/PERFORMANCE.md` (new)

**Acceptance Criteria**:
- [ ] Troubleshooting covers common issues
- [ ] Performance documentation helpful
- [ ] All CLI features properly documented
- [ ] Debug guidance comprehensive

**Notes**:
- Focus on troubleshooting and performance only
- Reference performance test results from Task 7c

---

## Implementation Notes

### CLI Command Reference
```bash
# Basic completion
claude -p "Hello, how are you?"

# JSON output
claude -p --output-format json "Hello, how are you?"

# Streaming JSON
claude -p --output-format stream-json "Hello, how are you?"

# With model selection
claude -p --model sonnet "Hello, how are you?"

# With system prompt
claude -p --append-system-prompt "You are a helpful assistant" "Hello"

# Health check
claude doctor
```

### Key Decisions Made
1. **CLI Priority**: CLI always takes priority over API when available
2. **No Auto-Fallback**: Let user decide when CLI fails, don't auto-fallback
3. **Authentication Detection**: Implement CLI auth detection with setup guidance
4. **Real CLI Tests**: Use actual CLI integration tests, not mocked
5. **Performance Options**: Provide configurable performance optimizations

### Performance Considerations
- **Subprocess Overhead**: Each CLI call spawns new process (~50-100ms overhead)
- **Process Pooling**: Option to reuse processes for better performance
- **Memory Usage**: Monitor subprocess memory usage
- **Concurrent Limits**: Configure max concurrent CLI processes

### Risk Mitigation
- Comprehensive error handling for subprocess failures
- Graceful degradation when CLI unavailable
- Clear user guidance for setup and troubleshooting
- Performance monitoring and optimization options

---

## Progress Updates

### [Date] - Task X Update
*Update progress and notes here as tasks are completed*

---

## Final Checklist

### Pre-Release Validation
- [ ] All 14 tasks completed
- [ ] Tests pass with real CLI integration
- [ ] Documentation is complete and accurate
- [ ] Migration guide tested
- [ ] Performance benchmarks available
- [ ] Error handling comprehensive
- [ ] Backward compatibility maintained

### Release Readiness
- [ ] Code review completed
- [ ] Integration tests pass
- [ ] Documentation reviewed
- [ ] Performance acceptable
- [ ] User experience smooth
- [ ] Migration path clear

**Completion Target**: [To be filled when started]  
**Actual Completion**: [To be filled when done]