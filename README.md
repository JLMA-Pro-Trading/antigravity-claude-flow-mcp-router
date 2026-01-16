# Antigravity Claude-Flow MCP Router

> **Zero-Timeout Handshake** • **Protocol Cleansing** • **100-Tool Limit Bypass**

## Overview

The **Antigravity Claude-Flow MCP Router** is a high-performance proxy layer designed to bridge the gap between strict MCP clients (Antigravity, Claude Code, Cursor) and heavy-weight agentic MCP servers like **Claude-Flow** and **Ruv-Swarm**. 

It eliminates the "invalid request" errors and startup timeouts that plague complex MCP integrations by implementing a **Synthetic Proxy Handshake** and **Real-Time Stdout Filtering**.

---

## ⚡ Performance Stats

| Metric | Traditional MCP | With Router | Improvement |
|--------|----------------|-------------|-------------|
| **Handshake Time** | ~5-10s (npx lag) | **<100ms** | **50-100x faster** |
| **Tool Limit** | 100 Tools (Global) | **175+ Tools** | **Bypassed** |
| **Protocol Stability**| ⚠️ Brittle (Log pollution) | ✅ 100% Clean | **Industrial Grade** |
| **Stability** | Manual restarts | Auto-Restarting | **Self-Healing** |

---

## 🛑 The Core Problems

### 1. The Startup Race (Handshake Timeout)
Antigravity expects a response to `initialize` within ~5 seconds. However, initializing a full agentic swarm via `npx` often takes 6-8 seconds.
- **Without Router**: Antigravity times out and marks the server as "Failed".
- **With Router**: The router responds **instantly** while the backend boots in the background.

### 2. Stdout Pollution (Protocol Poisoning)
Complex servers often print `[INFO]` or `[WARN]` logs directly to `stdout`. 
- **The Bug**: `invalid character '[' looking for beginning of value`.
- **The Fix**: The router sanitizes the stream, passing only valid JSON-RPC to the client and redirecting noise to `stderr`.

---

## 🏗 How It Works: The Proxy Cycle

The router implements an asymmetrical communication loop:

```
┌───────────────────────────────────────────────────────────┐
│              Standardized Proxy Handshake                 │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  1. INITIALIZE (Client → Router)                          │
│     Router responds INSTANTLY with synthetic success.     │
│                                                           │
│  2. BOOTSTRAP (Router → Backend)                          │
│     Router spawns backend in background.                  │
│                                                           │
│  3. DISCOVERY (Router ↔ Backend)                          │
│     Router perform internal handshake to map all tools.   │
│                                                           │
│  4. ROUTING (Proxy Mode)                                  │
│     Router exposes 10 "Meta-Tools" to Client.             │
│     Translates calls to 170+ Native Tools in Backend.     │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start (60 Seconds)

### 1. Positioning
Place this folder in your workspace:
`[your_path]/antigravity_claude-flow_mcp_router/`

### 2. Configuration (`mcp_config.json`)
Configure your IDE or Claude Desktop to use the router as a proxy:

```json
{
  "mcpServers": {
    "claude-flow": {
      "command": "node",
      "args": [
        "[path/to/router]/index.js",
        "claude-flow"
      ]
    },
    "ruv-swarm": {
      "command": "node",
      "args": [
        "[path/to/router]/index.js",
        "ruv-swarm"
      ]
    }
  }
}
```

---

## 🛠 Meta-Tools & Discovery

To stay under the global 100-tool limit, the router groups functions into **Category Hubs**:

| Meta-Tool | Maps To | Purpose |
|-----------|---------|---------|
| `cf_discover` | Internal Cache | Search 175+ native tools by name/desc |
| `cf_agent` | `agent/*` | Agent lifecycle & spawning |
| `cf_swarm` | `swarm/*` | Swarm coordination |
| `cf_memory` | `memory/*` | AgentDB / ReasoningBank access |
| `cf_execute` | `*` | Call ANY native tool by exact name |

---

## 📂 Architecture

- **`index.js`**: High-availability core logic with message queuing.
- **`configs/`**: JSON-style definitions for backends.
  - `claude-flow.js`: Mapping for v3.0.0-alpha.
  - `ruv-swarm.js`: Mapping for swarm-daa modules.
- **Queueing Engine**: Ensures no tool calls are lost if triggered while the backend is still warming up.

---

## 📜 Metadata

- **Protocol**: JSON-RPC 2.0 (MCP Compliant)
- **Engine**: Node.js (ESM)
- **Stability**: V5.5 (Production Ready)
- **Design Inspiration**: Claude-Flow V3
