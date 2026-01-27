---
title: SPARC - AISP-Only Middleware Refactor
created: 2026-01-27T13:17:10Z
last_updated: 2026-01-27T13:17:10Z
status: draft
---

# SPARC: Refactor to AISP-Only Middleware Layer

## S - Specification

### Objective
Transform the `antigravity_claude-flow_mcp_router` from a **protocol workaround solution** into a focused **AISP Enforcement Middleware** for multi-agent pipelines.

### Current State (V2.0)
The router currently provides:
1. ✅ Protocol workarounds (handshake, stdout filtering, tool limit bypass)
2. ✅ AISP 5.1 enforcement for agent-to-agent communication
3. ✅ Queueing and crash recovery
4. ✅ Meta-tool architecture

### Target State (V3.0 - AISP-Only)
The refactored router will provide:
1. ❌ **REMOVED**: Protocol workarounds (now handled upstream in claude-flow v3.0.0-alpha.119+)
2. ✅ **KEPT**: AISP 5.1 enforcement as core value proposition
3. ❌ **SIMPLIFIED**: Minimal passthrough proxy with AISP injection only
4. ✅ **ENHANCED**: Clear positioning as "AISP Middleware for Multi-Agent Pipelines"

### Upstream Dependency
- **Required**: `claude-flow@alpha` >= v3.0.0-alpha.119
- **Reason**: Upstream now handles stdout pollution, handshake timeouts, tool limits, and notification handling

### Constraints
1. Must preserve AISP enforcement functionality (core value)
2. Must simplify codebase by removing workarounds
3. Must maintain backward compatibility for AISP context injection
4. Must update documentation to reflect new positioning
5. Must follow JLMA git workflow (feature branch, atomic commits, push after each)

---

## P - Pseudocode

### New Architecture Flow

```
┌─────────────────────────────────────────────────┐
│         AISP Enforcement Middleware             │
│           (Minimal Passthrough Proxy)           │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. CLIENT → MIDDLEWARE                         │
│     Forward all MCP messages directly           │
│     (No synthetic handshake)                    │
│                                                 │
│  2. AISP INJECTION (Agent-to-Agent Only)        │
│     IF tool_call.name IN AGENT_TOOLS:           │
│       args = injectAISPContext(tool, args)      │
│     FORWARD to backend with AISP context        │
│                                                 │
│  3. BACKEND → CLIENT                            │
│     Forward all responses directly              │
│     (No stdout filtering needed - upstream fix) │
│                                                 │
│  4. MONITORING                                  │
│     aisp_status() reports enforcement state     │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Simplified index.js Logic

```javascript
// SIMPLIFIED: Direct passthrough with AISP injection
spawn_backend()

process.stdin.on('data', (line) => {
  request = parse(line)
  
  // AISP enforcement for agent tools
  if (request.method === 'tools/call' && isAgentTool(request.params.name)) {
    request.params.arguments = injectAISPContext(
      request.params.name, 
      request.params.arguments
    )
  }
  
  // Direct forward (no queueing, no handshake interception)
  backend.stdin.write(line)
})

backend.stdout.on('data', (line) => {
  // Direct forward (no stdout filtering needed)
  process.stdout.write(line)
})
```

---

## A - Architecture

### File Changes

#### Files to **MODIFY**

1. **`index.js`** (Simplify from 254 → ~80 lines)
   - Remove: Synthetic handshake (lines 46-115)
   - Remove: Stdout filtering logic (lines 66-135)
   - Remove: Tool call queueing (lines 217-235, 237-239)
   - Remove: Tool routing/discovery (lines 172-181)
   - Keep: AISP context injection (line 204)
   - Keep: Basic spawn/forward logic

2. **`aisp-enforcer.js`** (Keep as-is ✓)
   - No changes needed
   - Core AISP enforcement logic is standalone

3. **`package.json`**
   - Update version: `3.0.0`
   - Update description: "AISP Enforcement Middleware for Multi-Agent MCP Pipelines"

4. **`README.md`** (Complete rewrite)
   - New positioning: "AISP Middleware for Multi-Agent Pipelines"
   - Add upstream dependency note (claude-flow >= v3.0.0-alpha.119)
   - Remove protocol workaround sections
   - Focus on AISP value proposition
   - Add migration guide from v2.0

5. **`configs/claude-flow.js`**
   - Simplify: Remove meta-tool mappings
   - Keep: AISP status tool only

6. **`configs/ruv-swarm.js`**
   - Simplify: Remove meta-tool mappings
   - Keep: AISP status tool only

#### Files to **ARCHIVE** (Move to `docs/archive/`)

1. **`docs/GITHUB_ISSUE_MCP_ROBUSTNESS.md`**
   - Historical context for protocol fixes
   - Now resolved upstream

2. **`claude_flow_issue_alpha3.md`**
   - Original bug report
   - Now resolved upstream

#### Files to **KEEP**

1. **`docs/SPARC_AISP_IMPLEMENTATION.md`**
   - Still relevant for AISP integration details

### New Directory Structure

```
antigravity_claude-flow_mcp_router/
├── index.js                    # Simplified passthrough proxy (~80 lines)
├── aisp-enforcer.js            # AISP injection logic (unchanged)
├── package.json                # v3.0.0, new description
├── README.md                   # Complete rewrite
├── configs/
│   ├── claude-flow.js          # Simplified config
│   └── ruv-swarm.js            # Simplified config
└── docs/
    ├── SPARC_AISP_REFACTOR.md  # This file
    ├── SPARC_AISP_IMPLEMENTATION.md  # Keep
    └── archive/                # Historical docs
        ├── GITHUB_ISSUE_MCP_ROBUSTNESS.md
        └── claude_flow_issue_alpha3.md
```

---

## R - Refinement

### Edge Cases

1. **Backward Compatibility**
   - Users on older claude-flow versions will break
   - **Solution**: Document minimum version requirement clearly
   - **Migration**: Provide notice in README

2. **AISP Injection Failures**
   - What if args structure is unexpected?
   - **Already Handled**: `aisp-enforcer.js` handles multiple arg patterns

3. **Performance**
   - Removing queueing might cause race conditions
   - **Solution**: Assume upstream now handles initialization properly

### Audit Steps

1. ✅ Verify AISP injection still works after simplification
2. ✅ Confirm backend communication works without handshake workaround
3. ✅ Test with latest claude-flow@alpha
4. ✅ Verify README accurately reflects new scope
5. ✅ Ensure archived docs are accessible

---

## C - Completion Criteria

### Definition of Done

1. **Code**
   - [ ] `index.js` simplified to ~80 lines (passthrough + AISP injection)
   - [ ] All protocol workarounds removed
   - [ ] AISP enforcement preserved and functional
   - [ ] Configs simplified

2. **Documentation**
   - [ ] README rewritten with new positioning
   - [ ] Upstream dependency documented
   - [ ] Migration guide from v2.0 → v3.0
   - [ ] Historical docs archived

3. **Git Workflow**
   - [ ] Feature branch created: `feature/aisp-only-refactor`
   - [ ] All uncommitted changes committed first
   - [ ] Atomic commits for each file change
   - [ ] Continuous push after each commit
   - [ ] PR created with SPARC link

4. **Verification**
   - [ ] Tested with claude-flow@alpha (latest)
   - [ ] AISP injection confirmed working
   - [ ] Walkthrough document created with evidence
   - [ ] Version tagged as v3.0.0

### Success Metrics

| Metric | Target |
|--------|--------|
| Lines of Code | ~254 → ~80 (68% reduction) |
| Complexity | Protocol workarounds removed |
| Focus | 100% AISP enforcement |
| Documentation Clarity | Clear positioning and requirements |
| Backward Compatibility | Documented breaking change with migration path |

---

## User Review Required

> [!IMPORTANT]
> **Breaking Change**: This refactor removes all protocol workarounds. Users MUST upgrade to `claude-flow@alpha` >= v3.0.0-alpha.119 or the router will not function.

> [!WARNING]
> **Migration Impact**: Existing deployments using v2.0 for protocol fixes will break. They must either:
> 1. Upgrade claude-flow to latest alpha, OR
> 2. Stay on v2.0 router (archived branch)

### Questions for User

1. Should we maintain a `v2.0-legacy` branch for users who can't upgrade claude-flow yet?
2. Do you want to announce this as a breaking change in release notes?
3. Any specific AISP features you want enhanced while refactoring?

---

## Verification Plan

### Automated Tests
*Note: This project currently has no test suite. Verification will be manual.*

### Manual Verification

1. **Setup Test Environment**
   ```bash
   # Ensure latest claude-flow@alpha is available
   npm install -g claude-flow@alpha
   claude-flow --version  # Should be >= v3.0.0-alpha.119
   ```

2. **Test AISP Injection**
   - Start router with `node index.js claude-flow`
   - Send a `cf_agent` tool call via MCP client
   - Verify AISP context is injected in backend logs
   - Verify response contains AISP notation

3. **Test Direct Passthrough**
   - Send standard MCP messages (initialize, tools/list)
   - Verify no synthetic responses
   - Verify backend handles all protocol interactions

4. **Test AISP Status Tool**
   - Call `aisp_status` tool
   - Verify returns enforcement configuration

5. **Document Evidence**
   - Create `walkthrough.md` with:
     - Startup logs (no handshake interception)
     - AISP injection example
     - Performance comparison (if measurable)
     - Before/after LOC metrics
