export default {
    name: "ruv-swarm",
    backendCommand: "npx",
    backendArgs: ["-y", "ruv-swarm@latest", "mcp", "start"],
    routerTools: [
        { name: "ruv_agent", description: "Ruv-Swarm Agent Ops", inputSchema: { type: "object", properties: { action: { type: "string" }, params: { type: "object" } } } },
        { name: "ruv_swarm", description: "Ruv-Swarm Core Ops", inputSchema: { type: "object", properties: { action: { type: "string" }, params: { type: "object" } } } },
        { name: "ruv_execute", description: "Execute ANY ruv-swarm tool", inputSchema: { type: "object", properties: { tool: { type: "string" }, params: { type: "object" } }, required: ["tool"] } }
    ],
    mapToRealTool: (metaTool, action) => {
        // Add mapping logic here if ruv-swarm uses categories like agent/spawn
        // For now assuming simple or direct mapping via execute
        return action; // Default pass-through
    }
};
