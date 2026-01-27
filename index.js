#!/usr/bin/env node
/**
 * AISP Enforcement Middleware (V3.0)
 * 
 * Minimal passthrough proxy that injects AISP 5.1 context into
 * agent-to-agent communication for multi-agent MCP pipelines.
 * 
 * REQUIRES: claude-flow@alpha >= v3.0.0-alpha.119
 * 
 * Usage: node index.js <config-name>
 * Example: node index.js claude-flow
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectAISPContext, getAISPStatus } from './aisp-enforcer.js';

// Load Config
const args = process.argv.slice(2);
const configName = args[0];

if (!configName) {
    process.stderr.write("[AISP-Middleware] Error: No config name provided. Usage: node index.js <config-name>\n");
    process.exit(1);
}

let config;
try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const configPath = path.join(__dirname, 'configs', `${configName}.js`);
    const module = await import(configPath);
    config = module.default;
    process.stderr.write(`[AISP-Middleware] Loaded configuration for: ${config.name}\n`);
} catch (e) {
    process.stderr.write(`[AISP-Middleware] Error loading config '${configName}': ${e.message}\n`);
    process.exit(1);
}

// State
let backendProcess = null;
let stdinBuffer = '';

// Start Backend
function startBackend() {
    process.stderr.write(`[${config.name}] Starting backend...\n`);
    backendProcess = spawn(config.backendCommand, config.backendArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...(config.backendEnv || {}) }
    });

    // Direct passthrough - no stdout filtering (upstream fix)
    backendProcess.stdout.on('data', (data) => {
        process.stdout.write(data);
    });

    backendProcess.stderr.on('data', (data) => {
        process.stderr.write(`[Backend] ${data}`);
    });

    backendProcess.on('close', (code) => {
        process.stderr.write(`[${config.name}] Backend closed (code ${code}). Restarting...\n`);
        setTimeout(startBackend, 1000);
    });
}

// Handle Client Input with AISP Injection
function handleClientStdin(data) {
    stdinBuffer += data.toString();
    const lines = stdinBuffer.split('\n');
    stdinBuffer = lines.pop();

    for (const line of lines) {
        if (!line.trim()) continue;

        try {
            const request = JSON.parse(line);

            // AISP Status Tool (Router-provided)
            if (request.method === 'tools/call' && request.params?.name === 'aisp_status') {
                const response = {
                    jsonrpc: '2.0',
                    id: request.id,
                    result: {
                        content: [{
                            type: 'text',
                            text: JSON.stringify(getAISPStatus(), null, 2)
                        }]
                    }
                };
                process.stdout.write(JSON.stringify(response) + '\n');
                continue;
            }

            // AISP Injection for Agent Tools
            if (request.method === 'tools/call' && request.params) {
                const toolName = request.params.name;
                const toolArgs = request.params.arguments || {};

                // Inject AISP context if this is an agent-to-agent call
                request.params.arguments = injectAISPContext(toolName, toolArgs);
            }

            // Forward to backend
            if (backendProcess) {
                backendProcess.stdin.write(JSON.stringify(request) + '\n');
            }

        } catch (e) {
            // Invalid JSON - skip
        }
    }
}

// Wire up I/O
process.stdin.on('data', handleClientStdin);
startBackend();

// Graceful Shutdown
process.on('SIGINT', () => {
    if (backendProcess) backendProcess.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    if (backendProcess) backendProcess.kill('SIGTERM');
    process.exit(0);
});
