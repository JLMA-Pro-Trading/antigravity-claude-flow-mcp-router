# Antigravity Claude-Flow MCP Router

> **Zero-Timeout Handshake** • **Protocol Cleansing** • **100-Tool Limit Bypass** • **Robust JSON Parsing**

## Overview

The **Antigravity Claude-Flow MCP Router** is a high-performance proxy layer designed to bridge the gap between strict MCP clients (Antigravity, Claude Code, Cursor) and heavy-weight agentic MCP servers like **Claude-Flow** and **Ruv-Swarm**. 

It eliminates the "invalid request" errors and startup timeouts that plague complex MCP integrations by implementing a **Synthetic Proxy Handshake**, **Real-Time Stdout Filtering**, and **Robust Error Recovery**.

---

## ⚡ Performance Stats

| Metric | Traditional MCP | With Router | Improvement |
|--------|----------------|-------------|-------------|
| **Handshake Time** | ~5-10s (npx lag) | **<100ms** | **50-100x faster** |
| **Tool Limit** | 100 Tools (Global) | **175+ Tools** | **Bypassed** |
| **Protocol Stability**| ⚠️ Brittle (Log pollution) | ✅ 100% Clean | **Industrial Grade** |
| **Stability** | Manual restarts | Auto-Restarting | **Self-Healing** |
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

### 3. Industrial Robustness & "No-Silence" Recovery
Advanced servers often restart silently when they hit internal limits, leading to lost agent state ("Agent not found" errors).
- **The Problem**: A 10-hop pipeline fails if any link in the chain resets without the orchestrator's knowledge.
- **The Solution**: 
    - **Robust JSON Extraction**: Parses JSON-RPC even if prefixed by logs (Fixes Stdout Pollution).
    - **Crash Visibility**: Notifies the client immediately if a backend crash occurs, preventing silent memory wipes.
- **Documentation**: See [GITHUB_ISSUE_MCP_ROBUSTNESS.md](docs/GITHUB_ISSUE_MCP_ROBUSTNESS.md) for the full technical breakdown of the 5 critical fixes.

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
│     Router exposes 11 "Meta-Tools" to Client.             │
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

**Monitoring Tools**: `cf_agent`, `cf_swarm`, `cf_memory`, `cf_workflow`, `cf_task`, `cf_execute`, `cf_hooks`, `cf_analyze`, `cf_hive`.

---

## 📜 Metadata

- **Protocol**: JSON-RPC 2.0 (MCP Compliant)
- **Engine**: Node.js (ESM)
- **Version**: V3.0 (Clean Router)
- **Design Inspiration**: Claude-Flow V3 Orchestration
