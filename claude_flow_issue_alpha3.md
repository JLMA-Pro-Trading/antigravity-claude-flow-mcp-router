# Issue: MCP Compatibility & Robustness Improvements (Claude-Flow alpha 3)

## Summary
During the integration of [claude-flow](file:///home/vscode/.npm/_npx/7cfa166e65244432/node_modules/claude-flow) (v3.0.0-alpha.119) as an MCP server in the **Antigravity** environment, several critical protocol violations and usability bottlenecks were identified. These issues prevent out-of-the-box compatibility with strict MCP clients.

## Root Causes Identified

### 1. Stdout Pollution (Protocol Violation)
[claude-flow](file:///home/vscode/.npm/_npx/7cfa166e65244432/node_modules/claude-flow) emits `[INFO]`, `[WARN]`, and other non-JSON logs directly to `stdout`.
- **Impact**: MCP clients expecting clean JSON-RPC streams fail with parsing errors (e.g., `invalid character '[' looking for beginning of value`).
- **Proposed Fix**: Redirect all server-side logging to `stderr`. `stdout` MUST be reserved exclusively for JSON-RPC messages.

### 2. Handshake Timeout Failures
In environments like Antigravity, the `initialize` request has a strict 5-10s timeout. If `npx` takes too long or the server is busy indexing tools, the handshake fails.
- **Impact**: Server shows as "Failed to load" or "EOF" before it even starts.
- **Proposed Fix**: Implement an "Immediate Handshake" pattern. The server should listen on stdin/stdout immediately and respond to `initialize` with its capabilities, even if the tool registry is still loading in a background thread.

### 3. Tool Limit Overflow
[claude-flow](file:///home/vscode/.npm/_npx/7cfa166e65244432/node_modules/claude-flow) exposes over 175 tools. Some IDE-based MCP clients have a global limit (e.g., 100 tools) across all servers.
- **Impact**: The server is rejected entirely because it exceeds the limit.
- **Proposed Fix**: 
    - Implement a "Category Mount" flag in the CLI (e.g., `--mount agent,swarm`).
    - Use a discovery tool (like `cf_discover`) instead of listing all 175 tools in the initial `tools/list` response.

### 4. Brittle Notification Handling
Standard notifications (e.g., `notifications/roots/list_changed`) sent by many clients cause the server to return an error response `-32601 Method not found`.
- **Impact**: Some clients interpret these errors as a fatal initialization failure.
- **Proposed Fix**: Gracefully ignore (do not respond to) unsupported `notifications/*` instead of returning a JSON-RPC error.

## Workaround Implemented
We have successfully implemented a **Proxy Router** (`antigravity_claude-flow_mcp_router`) that addresses these issues by:
- Filtering non-JSON lines from `stdout`.
- Providing synthetic immediate responses to `initialize` and `tools/list`.
- Grouping 175+ tools into 10 Meta-Tools.

We strongly recommend implementing these fixes natively in **alpha 3** to ensure [claude-flow](file:///home/vscode/.npm/_npx/7cfa166e65244432/node_modules/claude-flow) becomes the most stable agentic MCP server on the market.
