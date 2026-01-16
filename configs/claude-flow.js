export default {
    name: "claude-flow",
    backendCommand: "npx",
    backendArgs: ["-y", "claude-flow@alpha", "mcp", "start"],
    routerTools: [
        { name: "cf_discover", description: "List all available claude-flow tools by category or search.", inputSchema: { type: "object", properties: { category: { type: "string" }, search: { type: "string" } } } },
        { name: "cf_agent", description: "Agent operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["spawn", "terminate", "status", "list", "pool", "health", "update"] }, params: { type: "object" } }, required: ["action"] } },
        { name: "cf_swarm", description: "Swarm operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["init", "status", "shutdown", "health"] }, params: { type: "object" } }, required: ["action"] } },
        { name: "cf_memory", description: "Memory operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["store", "retrieve", "search", "delete", "list", "stats"] }, params: { type: "object" } }, required: ["action"] } },
        { name: "cf_task", description: "Task operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["create", "status", "list", "complete", "update", "cancel"] }, params: { type: "object" } }, required: ["action"] } },
        { name: "cf_workflow", description: "Workflow operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["create", "execute", "status", "list", "pause", "resume", "cancel", "delete", "template"] }, params: { type: "object" } }, required: ["action"] } },
        { name: "cf_hooks", description: "Hooks & Intelligence", inputSchema: { type: "object", properties: { action: { type: "string" }, params: { type: "object" } }, required: ["action"] } },
        { name: "cf_analyze", description: "Analysis operations", inputSchema: { type: "object", properties: { action: { type: "string" }, params: { type: "object" } }, required: ["action"] } },
        { name: "cf_hive", description: "Hive-mind operations", inputSchema: { type: "object", properties: { action: { type: "string" }, params: { type: "object" } }, required: ["action"] } },
        { name: "cf_execute", description: "Execute ANY tool", inputSchema: { type: "object", properties: { tool: { type: "string" }, params: { type: "object" } }, required: ["tool"] } }
    ],
    mapToRealTool: (metaTool, action) => {
        const map = { cf_agent: 'agent', cf_swarm: 'swarm', cf_memory: 'memory', cf_task: 'task', cf_workflow: 'workflow', cf_hooks: 'hooks', cf_analyze: 'analyze', cf_hive: 'hive-mind' };
        return map[metaTool] ? `${map[metaTool]}/${action}` : action;
    }
};
