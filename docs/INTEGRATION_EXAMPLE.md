# V1.0 Router Integration Examples

Simple integration examples for the V1.0 Universal MCP Router.

## IDE Integration

### Claude Desktop

Add to your MCP configuration file:

```json
{
  "mcpServers": {
    "claude-flow": {
      "command": "node",
      "args": [
        "/workspaces/jlmaworkspace/antigravity_claude-flow_mcp_router/index.js",
        "claude-flow"
      ],
      "disabled": false
    }
  }
}
```

### Cursor IDE

```json
{
  "mcpServers": {
    "claude-flow": {
      "command": "node",
      "args": [
        "/absolute/path/to/antigravity_claude-flow_mcp_router/index.js",
        "claude-flow"
      ],
      "disabled": false
    }
  }
}
```

## Command Line Testing

### Basic Router Test

```bash
# Start router
node index.js claude-flow

# Test in another terminal
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node index.js claude-flow

# Expected: Immediate response with server info
```

### Tool Discovery Test

```bash
# Test tools/list
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node index.js claude-flow

# Expected: List of cf_* tools immediately
```

### Tool Execution Test

```bash
# Test discovery tool
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"cf_discover","arguments":{"category":"agent"}}}' | node index.js claude-flow

# Expected: Discovery results after backend is ready
```

## Configuration Examples

### Production Setup

```javascript
// configs/production.js
export default {
    name: "production",
    backendCommand: "claude-flow",
    backendArgs: ["mcp", "start"],
    routerTools: [
        { name: "cf_discover", description: "Tool discovery", inputSchema: { type: "object", properties: { category: { type: "string" } } } },
        { name: "cf_agent", description: "Agent operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["spawn", "status", "list"] }, params: { type: "object" } }, required: ["action"] } },
        { name: "cf_memory", description: "Memory operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["store", "retrieve", "search"] }, params: { type: "object" } }, required: ["action"] } }
    ],
    mapToRealTool: (metaTool, action) => {
        const map = { cf_agent: 'agent', cf_memory: 'memory' };
        return map[metaTool] ? `${map[metaTool]}_${action}` : action;
    }
};
```

### Development Setup

```javascript
// configs/development.js
export default {
    name: "development",
    backendCommand: "claude-flow",
    backendArgs: ["mcp", "start", "--verbose"],
    routerTools: [
        { name: "cf_discover", description: "Tool discovery", inputSchema: { type: "object", properties: { category: { type: "string" }, search: { type: "string" } } } },
        { name: "cf_debug", description: "Debug operations", inputSchema: { type: "object", properties: { action: { type: "string" }, target: { type: "string" } } } }
    ],
    mapToRealTool: (metaTool, action) => `debug_${action || 'info'}`
};
```

## Docker Integration

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY . .

# Install claude-flow CLI
RUN npm install -g @claude-flow/cli

EXPOSE 3000

CMD ["node", "index.js", "claude-flow"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  mcp-router:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - ./configs:/app/configs:ro
```

## Programmatic Integration

### Node.js Client

```javascript
import { spawn } from 'child_process';

class MCPClient {
    constructor(configName = 'claude-flow') {
        this.router = spawn('node', ['./index.js', configName], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        this.setupHandlers();
    }

    setupHandlers() {
        this.router.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(Boolean);
            lines.forEach(line => {
                try {
                    const response = JSON.parse(line);
                    this.handleResponse(response);
                } catch (e) {
                    // Not JSON
                }
            });
        });
    }

    async initialize() {
        const initMsg = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'nodejs-client', version: '1.0' }
            }
        };

        this.send(initMsg);
        return this.waitForResponse(1);
    }

    async listTools() {
        const toolsMsg = {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list'
        };

        this.send(toolsMsg);
        return this.waitForResponse(2);
    }

    send(message) {
        this.router.stdin.write(JSON.stringify(message) + '\n');
    }

    // ... rest of implementation
}

// Usage
const client = new MCPClient();
await client.initialize();
const tools = await client.listTools();
console.log('Available tools:', tools.result.tools);
```

### Python Client

```python
import subprocess
import json
import asyncio

class MCPRouter:
    def __init__(self, config_name='claude-flow'):
        self.process = subprocess.Popen(
            ['node', 'index.js', config_name],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

    def send_message(self, message):
        json_msg = json.dumps(message)
        self.process.stdin.write(json_msg + '\n')
        self.process.stdin.flush()

    def read_response(self):
        line = self.process.stdout.readline()
        return json.loads(line.strip())

    def initialize(self):
        init_msg = {
            'jsonrpc': '2.0',
            'id': 1,
            'method': 'initialize',
            'params': {
                'protocolVersion': '2024-11-05',
                'capabilities': {},
                'clientInfo': {'name': 'python-client', 'version': '1.0'}
            }
        }

        self.send_message(init_msg)
        return self.read_response()

    def list_tools(self):
        tools_msg = {
            'jsonrpc': '2.0',
            'id': 2,
            'method': 'tools/list'
        }

        self.send_message(tools_msg)
        return self.read_response()

# Usage
router = MCPRouter()
init_response = router.initialize()
tools_response = router.list_tools()
print(f"Available tools: {len(tools_response['result']['tools'])}")
```

## Error Handling Examples

### Client Timeout Handling

```javascript
// With timeout for immediate responses
async function safeToolsList(client, timeout = 5000) {
    return Promise.race([
        client.listTools(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
        )
    ]);
}

// V1.0 router should respond in <100ms
try {
    const tools = await safeToolsList(client, 1000); // 1s timeout
    console.log('✅ Got tools immediately:', tools);
} catch (error) {
    console.log('❌ Router may not be V1.0:', error.message);
}
```

### Backend Detection

```javascript
function detectBackendReady(routerProcess) {
    return new Promise((resolve) => {
        routerProcess.stderr.on('data', (data) => {
            const log = data.toString();
            if (log.includes('Backend READY')) {
                resolve(true);
            }
        });

        // V1.0 should be ready within 3-5 seconds
        setTimeout(() => resolve(false), 5000);
    });
}

const isReady = await detectBackendReady(routerProcess);
if (isReady) {
    console.log('✅ Backend ready - can make real tool calls');
} else {
    console.log('⚠️ Backend still starting - router tools only');
}
```

## Monitoring and Logging

### Health Check Endpoint

```javascript
// Simple health check for containerized deployments
import http from 'http';

const healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            version: '1.0',
            router: 'running',
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

healthServer.listen(3001, () => {
    console.log('Health check available at http://localhost:3001/health');
});
```

### Performance Metrics

```javascript
// Track router performance
class RouterMetrics {
    constructor() {
        this.responses = new Map();
        this.startTimes = new Map();
    }

    recordRequest(id, method) {
        this.startTimes.set(id, Date.now());
    }

    recordResponse(id) {
        const startTime = this.startTimes.get(id);
        if (startTime) {
            const duration = Date.now() - startTime;
            console.log(`Response time for ${id}: ${duration}ms`);
            this.startTimes.delete(id);

            // V1.0 initialize/tools_list should be <100ms
            if (duration > 1000) {
                console.warn('⚠️ Slow response detected - may not be V1.0');
            }
        }
    }
}
```

## Troubleshooting Integration Issues

### Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| **"No response"** | Wrong config path | Check absolute paths |
| **"Tools not found"** | Backend not ready | Wait for "Backend READY" log |
| **"Invalid request"** | Wrong protocol | Use V1.0 router |
| **"Timeout"** | V4.0 router | Switch to V1.0 |

### Debug Configuration

```bash
# Test with minimal config
node index.js minimal

# Check backend directly
claude-flow mcp start

# Verify configuration exists
ls -la configs/claude-flow.js
```

This covers the main integration patterns for the V1.0 router. The key advantage is **immediate responses** that eliminate all timing-related integration issues.