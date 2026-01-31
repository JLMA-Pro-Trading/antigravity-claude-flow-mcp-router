/**
 * Minimal Configuration for IDE Compatibility
 *
 * Stripped down to essentials for maximum IDE compatibility
 */

export default {
    name: "minimal",
    description: "Minimal IDE-compatible configuration",

    // Direct claude-flow backend
    backendCommand: "claude-flow",
    backendArgs: ["mcp", "start"],

    // Essential tools only
    routerTools: [
        {
            name: "cf_discover",
            description: "Discover available tools",
            inputSchema: {
                type: "object",
                properties: {
                    category: { type: "string" },
                    search: { type: "string" }
                }
            }
        },
        {
            name: "cf_agent",
            description: "Agent operations",
            inputSchema: {
                type: "object",
                properties: {
                    action: {
                        type: "string",
                        enum: ["spawn", "status", "list"]
                    },
                    params: { type: "object" }
                },
                required: ["action"]
            }
        },
        {
            name: "cf_memory",
            description: "Memory operations",
            inputSchema: {
                type: "object",
                properties: {
                    action: {
                        type: "string",
                        enum: ["store", "retrieve", "search"]
                    },
                    params: { type: "object" }
                },
                required: ["action"]
            }
        }
    ],

    // Simple mapping
    mapToRealTool: (metaTool, action) => {
        const map = {
            cf_agent: 'agent',
            cf_memory: 'memory',
            cf_discover: 'discover'
        };
        return map[metaTool] ? `${map[metaTool]}_${action || 'status'}` : action;
    },

    // Minimal middleware
    middleware: {
        enableAutoDetection: false,
        defaultClientProtocol: 'jsonrpc',
        defaultBackendProtocol: 'claude-flow',
        strictValidation: false,
        logTransformations: false
    }
};