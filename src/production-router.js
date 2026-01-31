#!/usr/bin/env node
/**
 * Production-Ready Universal MCP Router (V1.0 Enhanced)
 *
 * Features:
 * - Health monitoring and metrics collection
 * - Graceful shutdown with connection draining
 * - Structured logging for production
 * - Enhanced error handling with circuit breaker
 * - Resource management and cleanup
 *
 * Usage: node src/production-router.js <config-name>
 * Example: node src/production-router.js claude-flow
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { HealthMonitor, RequestTimer } from './health-monitor.js';
import { ErrorHandler, CircuitBreaker } from './error-handler.js';

// Router state
const state = {
    backendProcess: null,
    stdoutBuffer: '',
    stdinBuffer: '',
    isReady: false,
    allTools: [],
    toolCallQueue: [],
    internalCallbacks: new Map(),
    nextInternalId: 5000,
    isShuttingDown: false,
    pendingRequests: new Set(),
    config: null
};

// Production components
let healthMonitor = null;
let errorHandler = null;
let circuitBreaker = null;
let requestTimer = null;

/**
 * Initialize production router
 */
async function initializeRouter() {
    // Load configuration
    const configName = process.argv[2];
    if (!configName) {
        console.error("[ProductionRouter] Error: No config name provided. Usage: node production-router.js <config-name>");
        process.exit(1);
    }

    try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const configPath = path.join(__dirname, '../configs', `${configName}.js`);
        const module = await import(configPath);
        state.config = module.default;

        // Initialize production components
        healthMonitor = new HealthMonitor(state.config);
        errorHandler = new ErrorHandler(state.config);
        circuitBreaker = new CircuitBreaker();
        requestTimer = new RequestTimer();

        healthMonitor.log('info', `Configuration loaded successfully`, {
            configName,
            routerVersion: '1.0-enhanced'
        });

    } catch (e) {
        console.error(`[ProductionRouter] Error loading config '${configName}': ${e.message}`);
        process.exit(1);
    }
}

/**
 * Start backend process with circuit breaker protection
 */
async function startBackend() {
    if (state.isShuttingDown) return;

    try {
        await circuitBreaker.execute(async () => {
            healthMonitor.log('info', 'Starting backend process', {
                command: state.config.backendCommand,
                args: state.config.backendArgs
            });

            state.backendProcess = spawn(state.config.backendCommand, state.config.backendArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            setupBackendHandlers();
            return Promise.resolve();
        });
    } catch (error) {
        const recovery = errorHandler.handleError(error, { operation: 'start_backend' });

        if (recovery.action === 'restart_backend') {
            healthMonitor.log('warn', 'Backend start failed, retrying', {
                delay: recovery.delay,
                error: error.message
            });
            setTimeout(startBackend, recovery.delay || 1000);
        } else {
            healthMonitor.log('error', 'Failed to start backend, circuit breaker open', {
                error: error.message
            });
            healthMonitor.recordBackendStatus('disconnected');
        }
    }
}

/**
 * Setup backend process event handlers
 */
function setupBackendHandlers() {
    state.backendProcess.stdout.on('data', handleBackendStdout);

    state.backendProcess.stderr.on('data', (data) => {
        healthMonitor.log('debug', 'Backend stderr', { data: data.toString().trim() });
    });

    state.backendProcess.on('close', (code) => {
        const errorMsg = `Backend process closed with code ${code}`;
        healthMonitor.log('error', errorMsg, { code });

        healthMonitor.recordBackendStatus('disconnected');
        state.isReady = false;

        // Notify clients of backend unavailability
        notifyClients('backend_disconnected', { code, message: errorMsg });

        if (!state.isShuttingDown) {
            setTimeout(startBackend, 1000); // Restart after 1 second
        }
    });

    state.backendProcess.on('error', (error) => {
        const recovery = errorHandler.handleError(error, { operation: 'backend_process' });
        healthMonitor.log('error', 'Backend process error', { error: error.message });

        if (recovery.action === 'restart_backend' && !state.isShuttingDown) {
            setTimeout(startBackend, recovery.delay || 1000);
        }
    });
}

/**
 * Handle backend stdout with enhanced error recovery
 */
function handleBackendStdout(data) {
    state.stdoutBuffer += data.toString();

    // Process lines
    let lines = state.stdoutBuffer.split('\n');

    if (!state.stdoutBuffer.endsWith('\n')) {
        state.stdoutBuffer = lines.pop() || '';
    } else {
        state.stdoutBuffer = '';
    }

    for (const line of lines) {
        processBackendLine(line.trim());
    }
}

/**
 * Process individual backend output line
 */
function processBackendLine(line) {
    if (!line) return;

    // Handle stdout pollution - look for JSON starting with {
    const openBrace = line.indexOf('{');
    if (openBrace === -1) return;

    const potentialJson = line.substring(openBrace);

    try {
        const parsed = JSON.parse(potentialJson);
        handleBackendMessage(parsed);
    } catch (e) {
        const recovery = errorHandler.handleError(e, {
            operation: 'json_parse',
            line: line.substring(0, 100) // First 100 chars for debugging
        });

        if (recovery.action === 'skip_message') {
            healthMonitor.log('debug', 'Skipped malformed JSON from backend', {
                linePreview: line.substring(0, 50)
            });
        }
    }
}

/**
 * Handle parsed backend messages
 */
function handleBackendMessage(parsed) {
    // Internal handshake messages
    if (parsed.method === 'server.initialized') {
        sendInternalMessage({
            jsonrpc: '2.0',
            id: 4000,
            method: 'initialize',
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "ProductionRouter", version: "1.0-enhanced" }
            }
        });
        return;
    }

    if (parsed.id === 4000 && parsed.result) {
        sendInternalMessage({
            jsonrpc: '2.0',
            id: 4001,
            method: 'tools/list',
            params: {}
        });
        return;
    }

    if (parsed.id === 4001 && parsed.result?.tools) {
        state.allTools = parsed.result.tools;
        state.isReady = true;

        healthMonitor.recordBackendStatus('connected', state.allTools.length);
        healthMonitor.log('info', 'Backend ready', {
            toolCount: state.allTools.length,
            readyTime: Date.now()
        });

        flushToolQueue();
        return;
    }

    // Handle callback responses
    if (state.internalCallbacks.has(parsed.id)) {
        const callback = state.internalCallbacks.get(parsed.id);
        state.internalCallbacks.delete(parsed.id);

        if (parsed.error) {
            healthMonitor.recordToolCall('unknown', false);
        } else {
            healthMonitor.recordToolCall('unknown', true);
        }

        callback(parsed.result, parsed.error);
        return;
    }

    // Filter orphan errors
    if (parsed.error && !state.internalCallbacks.has(parsed.id) && parsed.id === null) {
        healthMonitor.log('debug', 'Filtered orphan error', { error: parsed.error });
        return;
    }

    // Forward to client
    process.stdout.write(JSON.stringify(parsed) + '\n');
}

/**
 * Handle client stdin input
 */
function handleClientStdin(data) {
    if (state.isShuttingDown) return;

    state.stdinBuffer += data.toString();
    const lines = state.stdinBuffer.split('\n');
    state.stdinBuffer = lines.pop() || '';

    for (const line of lines) {
        processClientMessage(line.trim());
    }
}

/**
 * Process client message
 */
function processClientMessage(line) {
    if (!line) return;

    try {
        const parsed = JSON.parse(line);
        const requestId = parsed.id;
        const startTime = requestTimer.start(requestId);

        // Track this as a pending request for graceful shutdown
        if (requestId) {
            state.pendingRequests.add(requestId);
        }

        handleClientRequest(parsed, startTime);
    } catch (e) {
        const recovery = errorHandler.handleError(e, {
            operation: 'client_json_parse',
            line: line.substring(0, 100)
        });

        if (recovery.action === 'send_error_response') {
            sendErrorResponse(null, recovery.code, 'Invalid JSON request');
        }
    }
}

/**
 * Handle client request
 */
function handleClientRequest(parsed, startTime) {
    const { method, id, params } = parsed;

    // Immediate response methods
    if (method === 'initialize') {
        const responseTime = requestTimer.end(id);
        healthMonitor.recordRequest('initialize', responseTime, 'success');

        replyToClient(id, {
            protocolVersion: "2024-11-05",
            serverInfo: {
                name: state.config.name + "-production-router",
                version: "1.0-enhanced"
            },
            capabilities: { tools: {}, resources: {}, prompts: {} }
        });

        state.pendingRequests.delete(id);
        return;
    }

    if (method === 'tools/list') {
        const responseTime = requestTimer.end(id);
        healthMonitor.recordRequest('tools/list', responseTime, 'success');

        replyToClient(id, { tools: state.config.routerTools });
        state.pendingRequests.delete(id);
        return;
    }

    // Handle unsupported methods
    if (method === 'notifications/roots/list_changed' ||
        method === 'notifications/initialized') {
        state.pendingRequests.delete(id);
        return;
    }

    // Handle tool calls
    if (method === 'tools/call' && params) {
        handleToolCall(parsed, startTime);
        return;
    }

    // Forward other methods to backend
    if (state.isReady) {
        sendInternalMessage(parsed);
    } else {
        // Queue if backend not ready
        queueRequest(() => sendInternalMessage(parsed));
    }
}

/**
 * Handle tool call requests
 */
function handleToolCall(parsed, startTime) {
    const { id, params } = parsed;
    const { name: toolName, arguments: args } = params;

    // Discovery tool
    if (toolName.endsWith('_discover')) {
        handleDiscoveryTool(id, args, startTime);
        return;
    }

    // Execute tool
    let realTool = toolName;
    let toolArgs = args;

    if (toolName.endsWith('_execute')) {
        realTool = args.tool;
        toolArgs = args.params || {};
    } else if (state.config.mapToRealTool) {
        realTool = state.config.mapToRealTool(toolName, args.action);
        toolArgs = args.params || {};
    }

    queueOrExecuteTool(id, realTool, toolArgs, startTime);
}

/**
 * Handle discovery tool calls
 */
function handleDiscoveryTool(id, args, startTime) {
    const filtered = state.allTools.filter(tool => {
        const catMatch = args?.category ?
            tool.name.startsWith(args.category + '/') : true;
        const searchMatch = args?.search ?
            (tool.name + (tool.description || '')).toLowerCase().includes(args.search.toLowerCase()) : true;
        return catMatch && searchMatch;
    });

    const text = `Found ${filtered.length} tools:\n` +
        filtered.map(t => `- ${t.name}: ${t.description?.substring(0, 100) || ''}`).join('\n');

    const responseTime = requestTimer.end(id);
    healthMonitor.recordRequest('discovery', responseTime, 'success');
    healthMonitor.recordToolCall('discovery', true);

    replyToClient(id, { content: [{ type: 'text', text }] });
    state.pendingRequests.delete(id);
}

/**
 * Queue or execute tool call
 */
function queueOrExecuteTool(clientId, toolName, args, startTime) {
    const internalId = state.nextInternalId++;

    const callback = (result, error) => {
        const responseTime = requestTimer.end(clientId);
        const success = !error;

        healthMonitor.recordRequest('tool_call', responseTime, success ? 'success' : 'error');
        healthMonitor.recordToolCall(toolName, success);

        if (error) {
            sendErrorResponse(clientId, error.code || -32000, error.message, error.data);
        } else {
            replyToClient(clientId, result);
        }

        state.pendingRequests.delete(clientId);
    };

    if (state.isReady) {
        state.internalCallbacks.set(internalId, callback);
        sendInternalMessage({
            jsonrpc: '2.0',
            id: internalId,
            method: 'tools/call',
            params: { name: toolName, arguments: args }
        });
    } else {
        queueRequest(() => {
            state.internalCallbacks.set(internalId, callback);
            sendInternalMessage({
                jsonrpc: '2.0',
                id: internalId,
                method: 'tools/call',
                params: { name: toolName, arguments: args }
            });
        });
    }
}

/**
 * Queue request for when backend is ready
 */
function queueRequest(fn) {
    state.toolCallQueue.push({ fn });
}

/**
 * Flush queued requests
 */
function flushToolQueue() {
    while (state.toolCallQueue.length > 0) {
        const { fn } = state.toolCallQueue.shift();
        fn();
    }
}

/**
 * Send message to backend
 */
function sendInternalMessage(message) {
    if (state.backendProcess && state.backendProcess.stdin.writable) {
        state.backendProcess.stdin.write(JSON.stringify(message) + '\n');
    }
}

/**
 * Reply to client
 */
function replyToClient(id, result) {
    process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        result
    }) + '\n');
}

/**
 * Send error response to client
 */
function sendErrorResponse(id, code, message, data = null) {
    const errorResponse = errorHandler.createErrorResponse(id, code, message, data);
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
}

/**
 * Notify clients of system events
 */
function notifyClients(event, data) {
    const notification = {
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: {
            level: 'error',
            data: { event, ...data }
        }
    };

    process.stdout.write(JSON.stringify(notification) + '\n');
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
    if (state.isShuttingDown) return;

    state.isShuttingDown = true;
    healthMonitor.log('info', `Received ${signal}, beginning graceful shutdown`, {
        pendingRequests: state.pendingRequests.size
    });

    // Stop accepting new requests
    process.stdin.pause();

    // Wait for pending requests to complete (with timeout)
    const drainPromise = new Promise((resolve) => {
        const checkPending = () => {
            if (state.pendingRequests.size === 0) {
                resolve();
            } else {
                setTimeout(checkPending, 100);
            }
        };
        checkPending();
    });

    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            healthMonitor.log('warn', 'Force closing pending requests', {
                remaining: state.pendingRequests.size
            });
            state.pendingRequests.clear();
            resolve();
        }, 5000);
    });

    await Promise.race([drainPromise, timeoutPromise]);

    // Clean up backend process
    if (state.backendProcess) {
        healthMonitor.log('info', 'Terminating backend process');
        state.backendProcess.kill('SIGTERM');

        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                state.backendProcess.kill('SIGKILL');
                resolve();
            }, 3000);

            state.backendProcess.on('close', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    // Shutdown monitoring
    if (healthMonitor) {
        await healthMonitor.shutdown();
    }

    healthMonitor.log('info', 'Graceful shutdown complete');
    process.exit(0);
}

/**
 * Cleanup routine for memory management
 */
function performCleanup() {
    // Clean up old request timers
    requestTimer.cleanup();

    // Clean up old error metrics
    if (errorHandler && Object.keys(errorHandler.errorCounts).length > 100) {
        healthMonitor.log('debug', 'Performing error metrics cleanup');
        // Reset old error counts but keep recent patterns
        errorHandler.reset();
    }

    // Log memory usage
    const memUsage = process.memoryUsage();
    healthMonitor.log('debug', 'Memory usage', {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
    });
}

/**
 * Main startup sequence
 */
async function main() {
    try {
        // Initialize router components
        await initializeRouter();

        // Setup input handler
        process.stdin.on('data', handleClientStdin);

        // Setup signal handlers for graceful shutdown
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

        // Setup cleanup interval
        setInterval(performCleanup, 30000); // Every 30 seconds

        // Start backend process
        await startBackend();

        healthMonitor.log('info', 'Production router started successfully', {
            configName: process.argv[2],
            nodeVersion: process.version,
            platform: process.platform,
            pid: process.pid
        });

    } catch (error) {
        console.error('[ProductionRouter] Fatal error during startup:', error);
        process.exit(1);
    }
}

// Start the router
main().catch(error => {
    console.error('[ProductionRouter] Unhandled error:', error);
    process.exit(1);
});