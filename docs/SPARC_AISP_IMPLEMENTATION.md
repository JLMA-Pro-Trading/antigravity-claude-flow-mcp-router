# SPARC Implementation Plan: AISP Enforcement Layer

## Specification

**Goal**: Integrate AISP 5.1 as forced enforcement layer in MCP router for zero-ambiguity agent communication.

**Requirements**:
- Force all agent-to-agent prompts through AISP encoding
- Keep user-facing responses in natural language
- Minimal latency overhead (< 50ms)
- One-time 8K token bootstrap cost

**Constraints**:
- No breaking changes to existing router interface
- Maintain backward compatibility with current configs
- Must work with both Claude-Flow and Ruv-Swarm backends

---

## Pseudocode

```javascript
// aisp-enforcer.js
export AISP_SPEC = <full AISP 5.1 specification>

export function injectAISPContext(params) {
    if (isAgentToAgent(params)) {
        return wrapWithAISP(params)
    }
    return params  // User-facing, keep as prose
}

export function isAgentToAgent(params) {
    // Check if caller is Antigravity and target is agent
    return params.tool in AGENT_TOOLS
}

// index.js modification
function handleAntigravityStdin(data) {
    // ... existing parsing ...
    if (parsed.method === 'tools/call') {
        const enforced = injectAISPContext(parsed.params)
        queueOrExecuteTool(parsed.id, enforced.name, enforced.arguments)
    }
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Antigravity Client                     │
└──────────────────┬──────────────────────────────┘
                   │ Prose prompt
                   ↓
┌─────────────────────────────────────────────────┐
│          MCP Router (index.js)                   │
│  ┌────────────────────────────────────────┐     │
│  │  AISP Enforcer (aisp-enforcer.js)      │     │
│  │  - Detect agent-to-agent calls         │     │
│  │  - Inject AISP context                 │     │
│  │  - Preserve user-facing prose          │     │
│  └────────────────────────────────────────┘     │
└──────────────────┬──────────────────────────────┘
                   │ AISP-enforced prompt
                   ↓
┌─────────────────────────────────────────────────┐
│    Claude-Flow / Ruv-Swarm Backend               │
│    (Agents communicate in AISP)                  │
└─────────────────────────────────────────────────┘
```

---

## Refinement

### File Structure
```
antigravity_claude-flow_mcp_router/
├── aisp-enforcer.js          [NEW]
├── index.js                   [MODIFY]
├── configs/
│   ├── claude-flow.js        [MODIFY - add aisp_status tool]
│   └── ruv-swarm.js          [NO CHANGE]
└── docs/
    └── SPARC_AISP_IMPLEMENTATION.md  [THIS FILE]
```

### Implementation Phases
1. **Phase 1**: Create `aisp-enforcer.js` with AISP spec + injection logic
2. **Phase 2**: Modify `index.js` to intercept and transform agent calls
3. **Phase 3**: Add `aisp_status` monitoring tool to configs
4. **Phase 4**: Test and verify AISP enforcement

### Git Commit Strategy
- Commit after each phase with descriptive messages
- Use conventional commits: `feat(aisp): add enforcer module`

---

## Completion

### Success Criteria
- [ ] `aisp-enforcer.js` created with complete AISP 5.1 spec
- [ ] `index.js` modified to inject AISP context
- [ ] `aisp_status` tool added to `claude-flow.js`
- [ ] Test: Agent-to-agent call contains AISP context
- [ ] Test: User-facing response remains in prose
- [ ] Latency overhead < 50ms

### Verification Steps
1. Send test prompt through router
2. Inspect backend logs for AISP notation
3. Measure latency with/without AISP
4. Run multi-agent task, verify AISP compliance
