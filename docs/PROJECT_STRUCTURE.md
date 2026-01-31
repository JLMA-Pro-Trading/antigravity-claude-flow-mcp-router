# Project Structure

Universal MCP Router V1.0 - Clean, simple, and reliable.

## 📁 Directory Structure

```
antigravity_claude-flow_mcp_router/
├── README.md                    # Main project documentation
├── CHANGELOG.md                 # Version history and migration guide
├── index.js                     # V1.0 Router (242 lines, simple)
├── package.json                 # Node.js dependencies
├── configs/                     # Router configurations
│   ├── README.md               # Configuration guide
│   ├── claude-flow.js          # ⭐ Primary config (recommended)
│   ├── minimal.js              # Troubleshooting config
│   ├── claude-flow-dual.js     # Compatibility config
│   ├── claude-flow-optimized.js # Performance config
│   └── jsonrpc-native.js       # Special cases config
├── docs/                        # Documentation
│   ├── INTEGRATION_EXAMPLE.md  # Integration examples
│   └── PROJECT_STRUCTURE.md    # This file
└── tests/                       # Testing
    └── test-v1-router.js       # V1.0 router validation test
```

## 🎯 Core Files

### `index.js` (V1.0 Router)
- **242 lines** of simple, reliable code
- **Immediate response** architecture
- **No complex middleware** or protocol transformation
- **Robust stdout filtering** and error recovery
- **Auto-backend management** with crash recovery

### `configs/claude-flow.js` (Primary Configuration)
- **10 cf_* tools** for complete functionality
- **Production ready** configuration
- **Battle tested** and reliable
- **Currently in use** in MCP setup

## 📋 Configuration Files

| File | Purpose | Tools | When to Use |
|------|---------|-------|-------------|
| **`claude-flow.js`** | **Primary production** | 10 cf_* tools | ⭐ **Default choice** |
| `minimal.js` | Troubleshooting | 3 essential tools | Debugging issues |
| `claude-flow-dual.js` | Compatibility | 12 dual-named tools | Mixed client environments |
| `claude-flow-optimized.js` | Performance | 7 balanced tools | Slow backend environments |
| `jsonrpc-native.js` | Special cases | Standard JSON-RPC tools | Custom backends |

## 📖 Documentation Files

### `README.md`
- **Main project documentation**
- Quick start guide
- Feature overview
- Configuration table
- Troubleshooting section

### `CHANGELOG.md`
- **Version history**
- Migration guide from V4.0 to V1.0
- Bug fixes and improvements
- Technical details

### `configs/README.md`
- **Configuration guide**
- Detailed configuration documentation
- Field requirements for V1.0
- Usage examples

### `docs/INTEGRATION_EXAMPLE.md`
- **Integration examples**
- IDE setup (Claude Desktop, Cursor)
- Command line testing
- Programmatic integration (Node.js, Python)
- Error handling examples

## 🧪 Testing

### `tests/test-v1-router.js`
- **V1.0 validation test**
- Tests immediate response capability
- Verifies tool discovery
- Confirms backend integration
- Simple health check

## 🚀 Key Features Documented

### V1.0 Architecture Benefits
1. **Immediate Response**: No waiting for backend initialization
2. **Simple Design**: 242 lines vs 686 lines (V4.0)
3. **100% Reliability**: No race conditions or timing issues
4. **Auto-Recovery**: Backend crash detection and restart
5. **Tool Flexibility**: Multiple configurations for different needs

### Problem Solved
- **"client is closing: invalid request"** → ✅ Eliminated
- **"invalid request" on startup** → ✅ Eliminated
- **Timeout failures** → ✅ Eliminated
- **Complex middleware issues** → ✅ Eliminated

## 🔧 Development Workflow

### Testing Changes
```bash
# Test basic functionality
node tests/test-v1-router.js

# Test with different configs
node index.js minimal
node index.js claude-flow-dual
```

### Adding New Configurations
1. Create new config file in `configs/`
2. Follow format in `configs/README.md`
3. Test with real IDE integration
4. Update `configs/README.md` documentation

### Debugging Issues
1. Start with `minimal.js` configuration
2. Check `claude-flow --version` for backend
3. Test backend directly: `claude-flow mcp start`
4. Use `test-v1-router.js` for validation

## 🎯 Design Philosophy

### V1.0 Principles
1. **Simplicity**: Minimal complexity, maximum reliability
2. **Immediate Response**: No client waiting
3. **Robust Recovery**: Handle all failure modes gracefully
4. **Clear Configuration**: Simple, documented config format
5. **Production Ready**: Battle-tested reliability

### What's NOT Included (Simplified from V4.0)
- ❌ Complex protocol transformation middleware
- ❌ Auto-detection and negotiation systems
- ❌ Circuit breakers and backpressure systems
- ❌ Performance monitoring dashboards
- ❌ Advanced logging and metrics

### What IS Included (V1.0 Focus)
- ✅ Immediate client responses
- ✅ Simple tool mapping system
- ✅ Backend process management
- ✅ Stdout pollution filtering
- ✅ Auto-recovery and restart

## 🔄 Version History Context

### Why V1.0?
- V4.0 was **over-engineered** and caused timing issues
- V1.0 is the **original working solution** that was proven reliable
- **Immediate response** architecture eliminates all race conditions
- **Simple codebase** is easier to maintain and debug

### Preserved Solutions
Solutions from V4.0 configurations were preserved in new configs:
- **Dual naming** → `claude-flow-dual.js`
- **Performance optimizations** → `claude-flow-optimized.js`
- **Compatibility features** → Multiple config options

This structure reflects a clean, production-ready MCP router that prioritizes reliability and simplicity over unnecessary complexity.