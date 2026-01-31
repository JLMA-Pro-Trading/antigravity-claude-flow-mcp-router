/**
 * Claude-Flow Dual Naming Configuration
 *
 * Provides both cf_* and standard naming for maximum compatibility
 * Based on solutions from hybrid-mode.js
 */

export default {
    name: "claude-flow-dual",
    backendCommand: "claude-flow",
    backendArgs: ["mcp", "start"],

    // DUAL TOOL SET - Both cf_* and standard names
    routerTools: [
        // Discovery tools
        { name: "cf_discover", description: "List all available claude-flow tools by category or search.", inputSchema: { type: "object", properties: { category: { type: "string" }, search: { type: "string" } } } },

        // Claude-Flow style (cf_ prefix)
        { name: "cf_agent", description: "Agent operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["spawn", "terminate", "status", "list", "pool", "health", "update"] }, params: { type: "object" } }, required: ["action"] } },
        { name: "cf_swarm", description: "Swarm operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["init", "status", "shutdown", "health"] }, params: { type: "object" } }, required: ["action"] } },
        { name: "cf_memory", description: "Memory operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["store", "retrieve", "search", "delete", "list", "stats"] }, params: { type: "object" } }, required: ["action"] } },

        // Standard JSON-RPC style (no prefix)
        { name: "agent_spawn", description: "Spawn a new agent", inputSchema: { type: "object", properties: { type: { type: "string" }, name: { type: "string" }, config: { type: "object" } }, required: ["type"] } },
        { name: "agent_status", description: "Get agent status", inputSchema: { type: "object", properties: { name: { type: "string" } } } },
        { name: "agent_terminate", description: "Terminate an agent", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
        { name: "swarm_init", description: "Initialize a swarm", inputSchema: { type: "object", properties: { topology: { type: "string" }, maxAgents: { type: "number" }, strategy: { type: "string" } } } },
        { name: "swarm_status", description: "Get swarm status", inputSchema: { type: "object", properties: {} } },
        { name: "memory_store", description: "Store data in memory", inputSchema: { type: "object", properties: { key: { type: "string" }, value: { type: "string" }, namespace: { type: "string" }, ttl: { type: "number" } }, required: ["key", "value"] } },
        { name: "memory_retrieve", description: "Retrieve data from memory", inputSchema: { type: "object", properties: { key: { type: "string" }, namespace: { type: "string" } }, required: ["key"] } },
        { name: "memory_search", description: "Search memory", inputSchema: { type: "object", properties: { query: { type: "string" }, namespace: { type: "string" } }, required: ["query"] } }
    ],

    // BIDIRECTIONAL MAPPING - Handles both naming conventions
    mapToRealTool: (metaTool, action) => {
        // Handle cf_ tools (original logic)
        if (metaTool.startsWith('cf_')) {
            const map = {
                cf_agent: 'agent',
                cf_swarm: 'swarm',
                cf_memory: 'memory',
                cf_task: 'task',
                cf_workflow: 'workflow',
                cf_hooks: 'hooks',
                cf_analyze: 'analyze',
                cf_hive: 'hive-mind'
            };
            return map[metaTool] ? `${map[metaTool]}_${action}` : action;
        }

        // Handle standard tools (NEW - from hybrid-mode solution)
        const standardToCf = {
            'agent_spawn': 'agent_spawn',
            'agent_status': 'agent_status',
            'agent_terminate': 'agent_terminate',
            'swarm_init': 'swarm_init',
            'swarm_status': 'swarm_status',
            'memory_store': 'memory_store',
            'memory_retrieve': 'memory_retrieve',
            'memory_search': 'memory_search'
        };

        return standardToCf[metaTool] || metaTool;
    }
};