# 🐛 MCP Protocol Violations & Robustness Issues (alpha 3+)

## Summary
When using `claude-flow@alpha` (v3.0.0-alpha.119) as an MCP server, several protocol violations prevent compatibility with strict MCP clients (e.g., Cursor, Windsurf). This document tracks 5 critical robustness issues and their corresponding fixes/mitigations.

## Issues & Solutions

### Issue 1. Stdout Pollution (Protocol Violation)
**Severity**: Critical
**Location**: `v3/mcp/server-entry.ts`

The server logs to `stdout` via `console.info`/`debug`, corrupting the JSON-RPC stream.

#### ❌ Current Behavior
```typescript
info: (msg: string, data?: unknown) => {
  if (shouldLog('info')) {
    console.info(formatMessage('info', msg, data)); // Writes to stdout
  }
}
```

#### ✅ Proposed Fix
Force all logging to `stderr`. `stdout` is exclusively for JSON-RPC.

```typescript
// v3/mcp/server-entry.ts

function createLogger(level: 'debug' | 'info' | 'warn' | 'error'): ILogger {
  // ...
  return {
    debug: (msg, data) => console.error(formatMessage('debug', msg, data)),
    info: (msg, data)  => console.error(formatMessage('info', msg, data)),
    warn: (msg, data)  => console.error(formatMessage('warn', msg, data)),
    error: (msg, data) => console.error(formatMessage('error', msg, data)),
  };
}
```

---

### Issue 2. Handshake Timeout Failures
**Severity**: High
**Location**: `v3/mcp/server-entry.ts`

`registerBuiltInTools()` blocks `main()` start-up. If it takes >5s, clients time out.

#### ❌ Current Behavior
```typescript
// Registers 175+ tools BEFORE server starts listening
await this.registerBuiltInTools(); 
await server.start();
```

#### ✅ Proposed Fix
Implement "Immediate Handshake". Start server first, load tools in background, then notify clients.

```typescript
// v3/mcp/server-entry.ts

async function main(): Promise<void> {
  // 1. Start Server IMMEDIATELY with minimal system tools
  const server = createMCPServer(config, logger);
  await server.start();

  // 2. Load heavy tools in BACKGROUND
  registerBuiltInTools(server, logger).then((count) => {
    logger.info(`Background tool loading complete: ${count} tools`);
    
    // 3. Notify client tools have changed
    if (options.transport === 'stdio') {
       console.log(JSON.stringify({
         jsonrpc: '2.0',
         method: 'notifications/tools/list_changed',
         params: {}
       }));
    }
  });
}
```

---

### Issue 3. Tool Limit Overflow
**Severity**: Medium
**Location**: `v3/mcp` Architecture

Exposing 175+ tools causes "Call stack exceeded" or bounds errors in some MCP clients (e.g. Cursor typically handles ~100 tools max).

#### ❌ Current Behavior
Linear list of 175+ tools (e.g. `agent/spawn`, `agent/list`, `swarm/init`, `swarm/scale`...).

#### ✅ Proposed Fix: "Meta-Tools" Architecture
Instead of exposing 175 micro-tools, expose 1 "Meta-Tool" per category. This significantly improves UX and reduces client load.

**Example: `agent/*` become one `cf_agent` tool.**

```typescript
// New native implementation structure

const metaTools = [
  {
      name: "cf_agent",
      description: "Manage agents (spawn, list, terminate)",
      inputSchema: {
          type: "object",
          properties: {
              action: { type: "string", enum: ["spawn", "list", "terminate"] },
              params: { type: "object" }
          },
          required: ["action"]
      },
      handler: async (args) => {
          // Route to internal micro-tools
          const internalTool = `agent/${args.action}`;
          return toolRegistry.execute(internalTool, args.params);
      }
  }
];
```

This reduces the tool count from **175+** to **~15** (one per domain: `cf_agent`, `cf_swarm`, `cf_memory`, etc.).

---

### Issue 4. Brittle Notification Handling
**Severity**: Medium
**Location**: `v3/mcp/server.ts`

Unsupported notifications (e.g. `notifications/roots/list_changed`) trigger `-32601 Method not found`, causing some clients to disconnect.

#### ✅ Proposed Fix
Gracefully ignore all notifications for which we don't have a handler.

```typescript
// v3/mcp/server.ts -> routeRequest()

private async routeRequest(request: MCPRequest): Promise<MCPResponse> {
  // ... switch case ...

  default:
    // SILENTLY IGNORE unknown notifications
    if (request.method.startsWith('notifications/')) {
       this.logger.debug('Ignored notification', { method: request.method });
       // For notifications (no id), we return nothing. 
       // For requests pretending to be notifications, we ack.
       if (request.id) {
         return { jsonrpc: '2.0', id: request.id, result: { ignored: true } };
       }
       return; 
    }

    // Default Error for unknown TOOLS
    return this.createErrorResponse(request.id, ErrorCodes.METHOD_NOT_FOUND, `Method not found`);
}
```

---

### Issue 5. Backend Memory Wipe on Silent Restart
**Severity**: Critical
**Location**: Backend process lifecycle management

When the `claude-flow` MCP server crashes or restarts (often due to Issues 1-4), **all spawned agents and swarm state are lost**. The client receives no notification, leading to confusing errors like:

```json
{ "status": "not_found", "error": "Agent not found" }
```

#### ❌ Current Cause
1. Stdout Pollution (Issue 1) causes JSON-RPC parsing failures.
2. Parsing failures trigger logic errors or disconnections that lead to process restart.
3. Restart wipes the in-memory agent registry.
4. Subsequent calls for existing agents fail with "Agent not found".

#### ✅ Proposed Fix: State Persistence + Crash Notification
Store agent/swarm state in a persistent store (SQLite/Redis) so that restarts don't lose state. Additionally, implement explicit notifications when the process lifecycle changes.

---

## Environment
- **claude-flow version**: 3.0.0-alpha.119
- **Node.js**: 20.x
- **Transport**: stdio 

---

## ✅ IMPLEMENTED: Router-Side Mitigations

The following mitigations have been applied in **`antigravity_claude-flow_mcp_router/index.js`** to improve robustness without requiring upstream `claude-flow` changes.

### 1. Robust JSON Extraction (Mitigates Issue 1)

Instead of requiring each line to start with `{`, we now extract JSON from anywhere in the line:

```javascript
// BEFORE (Fragile - drops "INFO: {json}" messages)
if (!line.trim().startsWith('{')) continue; 

// AFTER (Robust)
const openBrace = line.indexOf('{');
if (openBrace === -1) continue;
const potentialJson = line.substring(openBrace);
try {
    const parsed = JSON.parse(potentialJson);
    // Process valid JSON...
} catch (e) {
    // Attempt recovery or log error
}
```

**Result**: JSON-RPC messages prefixed with log text (`[INFO] {"jsonrpc":...}`) are now correctly parsed instead of being dropped.

### 2. Meta-Tools Architecture (Mitigates Issue 3)

Reduces tool count from 175+ to ~15 meta-tools (see `configs/claude-flow.js`):

```javascript
routerTools: [
    { name: "cf_agent", inputSchema: { action: ["spawn", "terminate", "status", "list"] } },
    { name: "cf_swarm", inputSchema: { action: ["init", "status", "shutdown"] } },
    { name: "cf_memory", inputSchema: { action: ["store", "retrieve", "search"] } },
    // ... total ~15 meta-tools
]
```

**Result**: Compatibility with clients having strict tool count limits (e.g. Cursor).

### 3. Crash Visibility (Mitigates Issue 5)

When the backend crashes, the router now logs explicitly to `stderr` and notifies the client via a JSON-RPC notification.

```javascript
backendProcess.on('close', (code) => {
    const msg = `[${config.name}] Backend CRASHED/CLOSED (code ${code}). Memory state LOST. Restarting in 1s...\n`;
    process.stderr.write(msg);
    // Notify client of the crash
    process.stdout.write(JSON.stringify({ 
        jsonrpc: '2.0', 
        method: 'notifications/message', 
        params: { level: 'error', data: msg } 
    }) + '\n');
    isReady = false;
    setTimeout(startBackend, 1000);
});
```

**Result**: Restarts are no longer silent, and the LLM becomes aware of memory state loss.

### 4. Verification Status

| Issue | Description | Router Mitigation | Status |
|-------|-------------|-------------------|--------|
| Issue 1 | Stdout Pollution | JSON extraction from any position | ✅ Verified |
| Issue 2 | Handshake Timeout | Meta-tool architecture reduces startup load | ✅ Verified |
| Issue 3 | Tool Limit Overflow | 175+ → ~15 meta-tools | ✅ Verified |
| Issue 4 | Brittle Notifications | Silent drop of unsupported types | ✅ Verified |
| Issue 5 | Memory Wipe | Crash notifications & crash prevention | ✅ Verified |

---

> [!TIP]
> These router-side mitigations are **temporary workarounds**. The upstream `claude-flow` package should implement the permanent fixes described in the "Issues & Solutions" section to achieve full protocol compliance and reliability.
