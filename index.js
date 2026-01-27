#!/usr/bin/env node
/**
 * Universal MCP Router/Guard (V1.0)
 * 
 * Usage: node index.js <config-name>
 * Example: node index.js claude-flow
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectAISPContext, isAgentToAgent, getAISPStatus } from './aisp-enforcer.js';

// Load Config
const args = process.argv.slice(2);
const configName = args[0];

if (!configName) {
    process.stderr.write("[UniversalRouter] Error: No config name provided. Usage: node index.js <config-name>\n");
    process.exit(1);
}

let config;
try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const configPath = path.join(__dirname, 'configs', `${configName}.js`);
    const module = await import(configPath);
    config = module.default;
    process.stderr.write(`[UniversalRouter] Loaded configuration for: ${config.name}\n`);
} catch (e) {
    process.stderr.write(`[UniversalRouter] Error loading config '${configName}': ${e.message}\n`);
    process.exit(1);
}

// State
let backendProcess = null;
let stdoutBuffer = '';
let stdinBuffer = '';
let isReady = false;
let allTools = [];
const toolCallQueue = [];
const internalCallbacks = new Map();
let nextInternalId = 5000;

// Backend Management
function startBackend() {
    process.stderr.write(`[${config.name}] Starting backend...\n`);
    backendProcess = spawn(config.backendCommand, config.backendArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...(config.backendEnv || {}) }
    });

    backendProcess.stdout.on('data', handleBackendStdout);
    backendProcess.stderr.on('data', (d) => process.stderr.write(`[Backend] ${d}`));

    backendProcess.on('close', (code) => {
        const msg = `[${config.name}] Backend CRASHED/CLOSED (code ${code}). Memory state LOST. Restarting in 1s...\n`;
        process.stderr.write(msg);
        // Notify client of the crash using a log message or error if possible
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'error', data: msg } }) + '\n');
        isReady = false;
        setTimeout(startBackend, 1000);
    });
}

function handleBackendStdout(data) {
    stdoutBuffer += data.toString();

    // Process strictly by lines first
    let lines = stdoutBuffer.split('\n');

    // Keep the last partial line in the buffer
    // If the data ends exactly with \n, the last element is empty string, which is fine to keep as buffer base
    if (!stdoutBuffer.endsWith('\n')) {
        stdoutBuffer = lines.pop();
    } else {
        stdoutBuffer = '';
    }

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // ROBUSTNESS FIX: Stdout Pollution Handling
        // Instead of requiring line.startsWith('{'), we look for the first '{' 
        // and try to parse from there. This handles "INFO: {json}" cases.
        const openBrace = line.indexOf('{');
        if (openBrace === -1) continue; // No JSON possible

        const potentialJson = line.substring(openBrace);

        try {
            const parsed = JSON.parse(potentialJson);

            // Internal Handshake
            if (parsed.method === 'server.initialized') {
                sendInternal({
                    jsonrpc: '2.0', id: 4000, method: 'initialize',
                    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "UniversalRouter", version: "1.0" } }
                });
                continue;
            }

            if (parsed.id === 4000 && parsed.result) {
                sendInternal({ jsonrpc: '2.0', id: 4001, method: 'tools/list', params: {} });
                continue;
            }

            if (parsed.id === 4001 && parsed.result?.tools) {
                allTools = parsed.result.tools;
                isReady = true;
                process.stderr.write(`[${config.name}] Backend READY (${allTools.length} tools).\n`);
                flushToolQueue();
                continue;
            }

            // Callbacks
            if (internalCallbacks.has(parsed.id)) {
                const cb = internalCallbacks.get(parsed.id);
                internalCallbacks.delete(parsed.id);
                cb(parsed.result, parsed.error);
                continue;
            }

            // Orphan Error Filtering
            if (parsed.error && !internalCallbacks.has(parsed.id) && parsed.id === null) continue;

            // Forward to Client
            process.stdout.write(JSON.stringify(parsed) + '\n');
        } catch (e) {
            // Attempt recovery: sometimes multiple JSONs or JSON + noise exist.
            // For now, simple suffix extraction is a huge improvement over "startsWith or die".
        }
    }
}

function handleAntigravityStdin(data) {
    stdinBuffer += data.toString();
    const lines = stdinBuffer.split('\n');
    stdinBuffer = lines.pop();

    for (const line of lines) {
        if (!line.trim()) continue;

        try {
            const parsed = JSON.parse(line);

            // Immediate Responses
            if (parsed.method === 'initialize') {
                reply(parsed.id, {
                    protocolVersion: "2024-11-05",
                    serverInfo: { name: config.name + "-router", version: "1.0.0" },
                    capabilities: { tools: {}, resources: {}, prompts: {} }
                });
                continue;
            }

            if (parsed.method === 'tools/list') {
                reply(parsed.id, { tools: config.routerTools });
                continue;
            }

            // Drop Unsupported
            if (parsed.method === 'notifications/roots/list_changed' ||
                parsed.method === 'notifications/initialized') continue;

            // Routing
            if (parsed.method === 'tools/call' && parsed.params) {
                const { name, arguments: args } = parsed.params;

                // Discovery
                if (name.endsWith('_discover')) {
                    const filtered = allTools.filter(t => {
                        const catMatch = args?.category ? t.name.startsWith(args.category + '/') : true;
                        const searchMatch = args?.search ? (t.name + (t.description || '')).toLowerCase().includes(args.search.toLowerCase()) : true;
                        return catMatch && searchMatch;
                    });
                    const text = `Found ${filtered.length} tools:\n` + filtered.map(t => `- ${t.name}: ${t.description?.substring(0, 100) || ''}`).join('\n');
                    reply(parsed.id, { content: [{ type: 'text', text }] });
                    return;
                }

                // AISP Status Tool
                if (name === 'aisp_status') {
                    reply(parsed.id, { content: [{ type: 'text', text: JSON.stringify(getAISPStatus(), null, 2) }] });
                    continue;
                }

                // Execute
                let realTool = name;
                let toolArgs = args;

                if (name.endsWith('_execute')) {
                    realTool = args.tool;
                    toolArgs = args.params || {};
                } else if (config.mapToRealTool) {
                    realTool = config.mapToRealTool(name, args.action);
                    toolArgs = args.params || {};
                } else {
                    toolArgs = args.params || {};
                }

                // Inject AISP context for agent-to-agent calls
                toolArgs = injectAISPContext(realTool, toolArgs);

                queueOrExecuteTool(parsed.id, realTool, toolArgs);
                continue;
            }

            // Forward
            if (isReady) backendProcess.stdin.write(line + '\n');

        } catch (e) { }
    }
}

function queueOrExecuteTool(antigravityId, toolName, args) {
    const internalId = nextInternalId++;
    const cb = (result, error) => {
        if (error) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: antigravityId, error }) + '\n');
        else reply(antigravityId, result);
    };

    if (isReady) {
        internalCallbacks.set(internalId, cb);
        sendInternal({ jsonrpc: '2.0', id: internalId, method: 'tools/call', params: { name: toolName, arguments: args } });
    } else {
        toolCallQueue.push({
            fn: () => {
                internalCallbacks.set(internalId, cb);
                sendInternal({ jsonrpc: '2.0', id: internalId, method: 'tools/call', params: { name: toolName, arguments: args } });
            }
        });
    }
}

function flushToolQueue() {
    while (toolCallQueue.length > 0) toolCallQueue.shift().fn();
}

function sendInternal(msg) {
    if (backendProcess) backendProcess.stdin.write(JSON.stringify(msg) + '\n');
}

function reply(id, result) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

process.stdin.on('data', handleAntigravityStdin);
startBackend();

process.on('SIGINT', () => { if (backendProcess) backendProcess.kill('SIGINT'); process.exit(0); });
process.on('SIGTERM', () => { if (backendProcess) backendProcess.kill('SIGTERM'); process.exit(0); });
