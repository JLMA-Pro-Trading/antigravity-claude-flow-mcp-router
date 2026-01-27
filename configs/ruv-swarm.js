/**
 * Ruv-Swarm Backend Configuration
 * 
 * Minimal passthrough config - no tool routing needed.
 * Backend exposes tools directly to client.
 */

export default {
    name: "ruv-swarm",
    backendCommand: "npx",
    backendArgs: ["-y", "ruv-swarm@latest", "mcp", "start"]
};
