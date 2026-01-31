# Router V1.0 Configurations

These configurations work with the simplified V1.0 router that provides immediate response to clients.

## Available Configurations

### 🎯 `claude-flow.js` (PRIMARY - IN USE)

**Purpose**: Full Claude-Flow integration with complete tool set
**Backend**: `claude-flow mcp start`
**Tools**: 10 cf_* tools (cf_agent, cf_swarm, cf_memory, etc.)

```bash
node index.js claude-flow
```

**Use when**:
- ✅ Production MCP integration
- ✅ Full Claude-Flow functionality needed
- ✅ IDE integration (Claude Desktop, Cursor, etc.)
- ✅ Complete tool access

---

### 🔧 `minimal.js` (BACKUP/TROUBLESHOOTING)

**Purpose**: Minimal configuration for maximum compatibility
**Backend**: `claude-flow mcp start`
**Tools**: 3 essential tools (cf_discover, cf_agent, cf_memory)

```bash
node index.js minimal
```

**Use when**:
- ✅ Troubleshooting connection issues
- ✅ Testing basic functionality
- ✅ IDE compatibility problems
- ✅ Debugging scenarios

---

### 🔌 `jsonrpc-native.js` (SPECIAL CASES)

**Purpose**: Direct JSON-RPC server without Claude-Flow
**Backend**: Custom JSON-RPC server
**Tools**: Standard JSON-RPC tools (no cf_ prefix)

```bash
# Edit the config to point to your JSON-RPC server first
node index.js jsonrpc-native
```

**Use when**:
- ✅ Custom JSON-RPC server integration
- ✅ Non-Claude-Flow backends
- ✅ Legacy system integration
- ✅ Standard MCP protocol compliance

---

### 🔄 `claude-flow-dual.js` (COMPATIBILITY SOLUTION)

**Purpose**: Provides BOTH cf_* and standard naming conventions
**Backend**: `claude-flow mcp start`
**Tools**: 12 tools (cf_agent + agent_spawn, cf_memory + memory_store, etc.)

```bash
node index.js claude-flow-dual
```

**Use when**:
- ✅ Client expects standard JSON-RPC tool names
- ✅ Mixed environment with different client expectations
- ✅ Maximum compatibility without protocol transformation
- ✅ Migrating from standard MCP to Claude-Flow

**Key Solution**: Bidirectional tool mapping from hybrid-mode.js

---

### ⚡ `claude-flow-optimized.js` (PERFORMANCE SOLUTION)

**Purpose**: Incorporates timing optimizations for challenging environments
**Backend**: `claude-flow mcp start`
**Tools**: 7 essential tools (balanced coverage)

```bash
node index.js claude-flow-optimized
```

**Use when**:
- ✅ Slow backend startup environments
- ✅ Performance-critical scenarios
- ✅ Documented optimization preferences needed
- ✅ Production with reasonable tool coverage

**Key Solutions**: Timeout optimizations from fast-init.js

---

## Configuration Requirements

All configurations must have these fields for V1.0 router:

```javascript
export default {
    name: "config-name",                    // Required: Configuration identifier
    backendCommand: "command",              // Required: Backend executable
    backendArgs: ["arg1", "arg2"],          // Required: Backend arguments
    routerTools: [ /* tool definitions */ ], // Required: Router tool list
    mapToRealTool: (tool, action) => { }    // Optional: Tool name mapping
};
```

## V1.0 Router Features

✅ **Immediate responses** - No waiting for backend initialization
✅ **Simple architecture** - 242 lines, no complex middleware
✅ **Robust stdout filtering** - Handles backend log pollution
✅ **Tool discovery** - Built-in cf_discover functionality
✅ **Auto-recovery** - Backend restart on crashes

## Migration from V4.0

If you have V4.0 configurations with these fields, they won't be used:
- `middleware.*` - Middleware system removed
- `protocolMode` - Protocol detection simplified
- `startupMode` - Immediate response mode only
- `enableTransformation` - No protocol transformation

## Testing Configurations

```bash
# Test any configuration:
node index.js <config-name>

# Verify it responds to tools/list:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node index.js <config-name>
```