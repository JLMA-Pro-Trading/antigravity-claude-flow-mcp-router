/**
 * Claude-Flow Optimized Configuration
 *
 * Incorporates timing optimizations from fast-init.js for slow backends
 * Works with V1.0 router for maximum reliability
 */

export default {
    name: "claude-flow-optimized",
    backendCommand: "claude-flow",
    backendArgs: ["mcp", "start"],

    // OPTIMIZATION HINTS - For backends that need special handling
    // NOTE: V1.0 router ignores these, but they document the intent
    optimizations: {
        startupMode: "aggressive",      // From fast-init.js
        maxStartupWait: 2000,           // 2s instead of 10s
        fastInit: true,                 // Immediate responses (V1.0 does this naturally)
        immediateResponse: true         // V1.0 default behavior
    },

    // EXTENDED TOOL SET - More tools than minimal, less than full
    routerTools: [
        { name: "cf_discover", description: "List all available claude-flow tools by category or search.", inputSchema: { type: "object", properties: { category: { type: "string" }, search: { type: "string" } } } },

        // Core agent management
        { name: "cf_agent", description: "Agent operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["spawn", "terminate", "status", "list", "pool", "health", "update"] }, params: { type: "object" } }, required: ["action"] } },

        // Swarm coordination
        { name: "cf_swarm", description: "Swarm operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["init", "status", "shutdown", "health"] }, params: { type: "object" } }, required: ["action"] } },

        // Memory management
        { name: "cf_memory", description: "Memory operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["store", "retrieve", "search", "delete", "list", "stats"] }, params: { type: "object" } }, required: ["action"] } },

        // Task management
        { name: "cf_task", description: "Task operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["create", "status", "list", "complete", "update", "cancel"] }, params: { type: "object" } }, required: ["action"] } },

        // Essential workflows
        { name: "cf_workflow", description: "Workflow operations", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["create", "execute", "status", "list"] }, params: { type: "object" } }, required: ["action"] } },

        // Intelligence hooks
        { name: "cf_hooks", description: "Hooks & Intelligence", inputSchema: { type: "object", properties: { action: { type: "string" }, params: { type: "object" } }, required: ["action"] } }
    ],

    // OPTIMIZED MAPPING - From fast-init.js logic
    mapToRealTool: (metaTool, action) => {
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
    },

    // COMPATIBILITY NOTES - What this config is good for
    notes: {
        purpose: "Optimized for environments with timing constraints",
        benefits: [
            "Faster perceived startup (V1.0 already provides this)",
            "Good tool coverage without overwhelming clients",
            "Documented optimization preferences",
            "Suitable for production with reasonable tool set"
        ],
        usage: "node index.js claude-flow-optimized"
    }
};