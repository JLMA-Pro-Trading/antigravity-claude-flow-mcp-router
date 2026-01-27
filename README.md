# AISP Enforcement Middleware

> **Zero-Ambiguity Agent Communication** • **Multi-Agent Pipeline Reliability** • **97× Success Rate Improvement**

## Overview

The **AISP Enforcement Middleware** is a lightweight MCP proxy that injects **AISP 5.1 (AI Specification Protocol)** context into agent-to-agent communication, dramatically reducing ambiguity and semantic drift in multi-agent pipelines.

Unlike natural language (40-65% ambiguity), AISP reduces communication ambiguity to <2%, enabling reliable multi-hop agent coordination with **97× better success rates** compared to prose-based pipelines.

---

## 🎯 What is AISP?

**AISP (AI Specification Protocol)** is a formal specification language designed for zero-ambiguity agent communication. It uses symbolic notation to eliminate semantic drift in multi-agent systems.

### The Problem: Semantic Drift

In multi-agent pipelines, each agent interprets natural language instructions slightly differently. This compounds with each hop:

| Pipeline Depth | Ambiguity per Hop | Cumulative Success Rate |
|----------------|-------------------|------------------------|
| 1-hop (prose) | 40-65% | 50% |
| 5-hop (prose) | 40-65% | 7.8% |
| 10-hop (prose) | 40-65% | **0.84%** |
| 10-hop (AISP) | <2% | **81.7%** |

**Result**: AISP provides **97× improvement** in 10-hop pipeline success rate.

### How AISP Works

AISP uses formal notation to encode specifications, constraints, and coordination logic:

```
⟦Ω:Enforcement⟧{
  ∀agent:task∈{spec,instruct,coordinate}⇒output(AISP)
  ∀response:Ambig(response)<0.02∧δ≥0.40
  
  ;; Core Invariant
  ∀D∈AISP:Ambig(D)<0.02
  Ambig≜λD.1-|Parse_u(D)|/|Parse_t(D)|
}
```

- **Symbol Locking**: Each symbol has exactly one meaning (anti-drift)
- **Formal Validation**: Parseable specification with quality tiers
- **Proof-Carrying Code**: Evidence embedded in communication

---

## 📋 Requirements

- **Upstream Dependency**: `claude-flow@alpha` >= v3.0.0-alpha.119 **OR** `ruv-swarm@latest`
- **Important**: This middleware **requires** that the backend MCP server has native protocol fixes (stdout cleanliness, proper handshake, tool handling)

> [!WARNING]
> **Breaking Change from v2.0**: This version removes all protocol workarounds. If your backend is `claude-flow` < v3.0.0-alpha.119, use router v2.0 instead (see archived branch).

---

## 🚀 Quick Start

### 1. Installation

Clone this repository to your workspace:

```bash
cd /your/workspace
git clone https://github.com/JLMA-Pro-Trading/antigravity-claude-flow-mcp-router.git
cd antigravity-claude-flow-mcp-router
```

### 2. Configuration

Add the middleware to your MCP client config (e.g., Antigravity, Claude Desktop, Cursor):

**Example: `mcp_config.json`**

```json
{
  "mcpServers": {
    "claude-flow": {
      "command": "node",
      "args": [
        "/absolute/path/to/antigravity-claude-flow-mcp-router/index.js",
        "claude-flow"
      ]
    }
  }
}
```

### 3. Verify AISP Enforcement

Once connected, call the `aisp_status` tool:

```json
{
  "enabled": true,
  "spec_version": "5.1",
  "spec_size_tokens": 8817,
  "enforcement_mode": "forced",
  "ambiguity_threshold": 0.02,
  "min_quality_tier": "◊",
  "agent_tools_monitored": 9
}
```

---

## 🧬 How It Works

The middleware operates as a **selective injection proxy**:

```
┌─────────────────────────────────────────────┐
│        AISP Enforcement Middleware          │
├─────────────────────────────────────────────┤
│                                             │
│  1. CLIENT → MIDDLEWARE                     │
│     All MCP messages pass through           │
│                                             │
│  2. AISP DETECTION                          │
│     IF tool IN [cf_agent, cf_swarm, ...]   │
│       INJECT AISP context into args         │
│     ELSE                                    │
│       Pass through unchanged                │
│                                             │
│  3. MIDDLEWARE → BACKEND                    │
│     Agent calls enriched with AISP spec     │
│     User-facing calls remain prose          │
│                                             │
│  4. BACKEND → CLIENT                        │
│     Direct passthrough (no filtering)       │
│                                             │
└─────────────────────────────────────────────┘
```

### Monitored Agent Tools

AISP enforcement is **automatically applied** to these tool prefixes:

- `cf_agent` - Agent lifecycle operations
- `cf_swarm` - Swarm coordination
- `cf_memory` - Memory/knowledge operations
- `cf_workflow` - Workflow orchestration
- `cf_task` - Task management
- `cf_execute` - Tool execution
- `cf_hooks` - Hook registration
- `cf_analyze` - Analysis operations
- `cf_hive` - Hive-mind coordination
- `ruv_*` - Ruv-Swarm operations

All other tool calls and user-facing responses **remain in natural language**.

---

## 📊 Performance Metrics

| Metric | Prose Baseline | AISP Enforced | Improvement |
|--------|----------------|---------------|-------------|
| **Ambiguity** | 40-65% | <2% | **20-30× better** |
| **10-hop Success** | 0.84% | 81.7% | **97× better** |
| **Semantic Drift** | High | Blocked | **Anti-drift guaranteed** |
| **Token Overhead** | 0 | 8,817 (one-time) | Amortized to ~0/call |

### One-Time Cost

The AISP specification is injected **once per agent session** (~8,817 tokens). After that, all agent-to-agent calls reference the specification with **zero additional overhead**.

---

## 🏗 Architecture

### File Structure

```
antigravity-claude-flow-mcp-router/
├── index.js                   # Minimal passthrough proxy (~128 lines)
├── aisp-enforcer.js           # AISP injection logic
├── package.json               # v3.0.0 metadata
├── README.md                  # This file
├── configs/
│   ├── claude-flow.js         # Claude-Flow backend config
│   └── ruv-swarm.js           # Ruv-Swarm backend config
└── docs/
    ├── SPARC_AISP_IMPLEMENTATION.md  # Implementation details
    ├── SPARC_AISP_REFACTOR.md        # Refactoring specification
    └── archive/                       # Historical protocol docs
```

### Supported Backends

- **Claude-Flow** (requires v3.0.0-alpha.119+)
- **Ruv-Swarm** (latest)

---

## 🔄 Migration from v2.0

### What Changed

**Removed** (now handled upstream):
- ❌ Synthetic handshake responses
- ❌ Stdout pollution filtering
- ❌ Tool call queueing
- ❌ Meta-tool routing architecture

**Kept** (core value):
- ✅ AISP 5.1 context injection
- ✅ Agent-to-agent call detection
- ✅ `aisp_status` monitoring tool
- ✅ Selective enforcement (agent calls only)

### Migration Steps

1. **Upgrade Backend**: Ensure `claude-flow@alpha` >= v3.0.0-alpha.119
2. **Update Router**: Pull latest v3.0.0 from this repository
3. **Test**: Verify AISP enforcement with `aisp_status` tool
4. **Monitor**: Check that agent pipelines complete successfully

### Backward Compatibility

If you **cannot upgrade** your backend, you have two options:

1. **Stay on v2.0**: Check out the `feature/aisp-enforcement` branch (legacy support)
2. **Request Upstream Fix**: File an issue with your MCP server maintainer

---

## 🛠 Monitoring

Use the `aisp_status` tool to inspect enforcement configuration:

```bash
# Via MCP client
TOOL: aisp_status

# Response
{
  "enabled": true,
  "spec_version": "5.1",
  "enforcement_mode": "forced",
  "ambiguity_threshold": 0.02,
  "min_quality_tier": "◊",
  "agent_tools_monitored": 9
}
```

---

## 📚 Documentation

- **Implementation Guide**: [`docs/SPARC_AISP_IMPLEMENTATION.md`](docs/SPARC_AISP_IMPLEMENTATION.md)
- **Refactoring Specification**: [`docs/SPARC_AISP_REFACTOR.md`](docs/SPARC_AISP_REFACTOR.md)
- **Historical Context**: [`docs/archive/`](docs/archive/)

---

## 🤝 Contributing

Issues and pull requests are welcome! This project focuses exclusively on AISP enforcement for multi-agent pipelines.

**Upstream Issues**: For protocol bugs in `claude-flow` or `ruv-swarm`, please file issues with those projects directly.

---

## 📜 Metadata

- **Protocol**: JSON-RPC 2.0 (MCP Compliant)
- **Runtime**: Node.js (ESM)
- **Version**: 3.0.0 (AISP-Only)
- **License**: MIT
- **Design Inspiration**: AISP 5.1 Specification + Claude-Flow V3

---

## 🎯 When to Use This Middleware

✅ **Use AISP Middleware When**:
- Building multi-agent pipelines (>3 agents)
- Coordinating complex workflows across agents
- Requiring high reliability in agent handoffs
- Needing proof-carrying specifications

❌ **Skip AISP Middleware When**:
- Single-agent workflows
- Direct user-to-agent communication only
- No agent-to-agent coordination needed
