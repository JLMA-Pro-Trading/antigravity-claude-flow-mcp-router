/**
 * JSON-RPC Native Configuration
 *
 * Configuration for native JSON-RPC servers that don't need claude-flow translation
 */

export default {
    name: "jsonrpc-native",
    description: "Direct JSON-RPC 2.0 server without claude-flow layer",

    // Backend command for JSON-RPC server
    backendCommand: "node",
    backendArgs: ["your-jsonrpc-server.js"],

    // Protocol settings
    protocolMode: "jsonrpc-native",
    enableTransformation: false,

    // Standard JSON-RPC tools (no cf_ prefix)
    routerTools: [
        {
            name: "initialize",
            description: "Initialize the server",
            inputSchema: {
                type: "object",
                properties: {
                    protocolVersion: { type: "string" },
                    capabilities: { type: "object" },
                    clientInfo: { type: "object" }
                },
                required: ["protocolVersion", "capabilities", "clientInfo"]
            }
        },
        {
            name: "tools_list",
            description: "List available tools",
            inputSchema: {
                type: "object",
                properties: {}
            }
        },
        {
            name: "tools_call",
            description: "Call a tool",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    arguments: { type: "object" }
                },
                required: ["name"]
            }
        },
        {
            name: "completion/complete",
            description: "Request completions",
            inputSchema: {
                type: "object",
                properties: {
                    argument: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            value: { type: "string" }
                        },
                        required: ["name", "value"]
                    }
                },
                required: ["argument"]
            }
        },
        {
            name: "logging/setLevel",
            description: "Set logging level",
            inputSchema: {
                type: "object",
                properties: {
                    level: {
                        type: "string",
                        enum: ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]
                    }
                },
                required: ["level"]
            }
        }
    ],

    // No tool mapping needed for native JSON-RPC
    mapToRealTool: null,

    // Router-specific settings
    middleware: {
        enableAutoDetection: false,
        defaultClientProtocol: 'jsonrpc',
        defaultBackendProtocol: 'jsonrpc',
        strictValidation: true,
        logTransformations: false
    }
};