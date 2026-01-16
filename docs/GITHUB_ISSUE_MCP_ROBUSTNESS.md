# 🐛 MCP Protocol Violations & Robustness Issues (alpha 3+)

## Summary
When using `claude-flow@alpha` (v3.0.0-alpha.119) as an MCP server, several protocol violations prevent compatibility with strict MCP clients (e.g., Cursor, Windsurf). This issue tracks 4 critical robustness fixes.

## Issues & Solutions

### 1. Stdout Pollution (Protocol Violation)
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

### 2. Handshake Timeout Failures
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
Implement "Immediate Handshake". Start server first, load tools in background, then notify.

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

### 3. Tool Limit Overflow
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

### 4. Brittle Notification Handling
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

## Environment
- **claude-flow version**: 3.0.0-alpha.119
- **Node.js**: 20.x
- **Transport**: stdio 
