/**
 * Claude-Flow Backend Configuration
 * 
 * Minimal passthrough config - no tool routing needed.
 * Backend exposes tools directly to client.
 * 
 * REQUIRES: claude-flow@alpha >= v3.0.0-alpha.119
 */

export default {
    name: "claude-flow",
    backendCommand: "npx",
    backendArgs: ["-y", "claude-flow@alpha", "mcp", "start"],
    backendEnv: {
        CLAUDE_FLOW_MODE: "v3",
        CLAUDE_FLOW_MEMORY_BACKEND: "hybrid"
    }
};
