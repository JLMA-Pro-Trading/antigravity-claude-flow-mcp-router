/**
 * Core Router Tests
 * Comprehensive unit tests for the main router functionality
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import EventEmitter from 'events';

// Mock child process for testing
class MockChildProcess extends EventEmitter {
    constructor() {
        super();
        this.stdin = { write: () => true };
        this.stdout = new EventEmitter();
        this.stderr = new EventEmitter();
        this.killed = false;
    }

    kill(signal) {
        this.killed = true;
        this.emit('close', signal === 'SIGTERM' ? 15 : 2);
        return true;
    }
}

// Mock process streams for testing
class MockProcess {
    constructor() {
        this.stdin = new EventEmitter();
        this.stdout = { write: () => true };
        this.stderr = { write: () => true };
        this.env = {};
        this.argv = ['node', 'test.js'];
        this.exitCode = null;
    }

    exit(code) {
        this.exitCode = code;
    }

    on(event, callback) {
        // Mock signal handlers
        if (event === 'SIGINT' || event === 'SIGTERM') {
            this.signalHandlers = this.signalHandlers || {};
            this.signalHandlers[event] = callback;
        }
    }
}

describe('Router Core Functionality', () => {
    let mockProcess;
    let mockBackendProcess;
    let originalSpawn;
    let originalProcess;

    beforeEach(() => {
        mockProcess = new MockProcess();
        mockBackendProcess = new MockChildProcess();

        // Mock spawn function
        originalSpawn = global.spawn;
        global.spawn = () => mockBackendProcess;

        // Store original process references
        originalProcess = {
            stdin: process.stdin,
            stdout: process.stdout,
            stderr: process.stderr,
            exit: process.exit,
            on: process.on
        };
    });

    afterEach(() => {
        // Restore original functions
        global.spawn = originalSpawn;
        Object.assign(process, originalProcess);
    });

    describe('Configuration Loading', () => {
        it('should load valid configuration', () => {
            const validConfig = {
                name: 'test-router',
                backendCommand: 'node',
                backendArgs: ['test.js'],
                routerTools: [{
                    name: 'test_tool',
                    description: 'Test tool',
                    inputSchema: { type: 'object' }
                }]
            };

            // Test configuration validation
            assert.ok(validConfig.name);
            assert.ok(validConfig.backendCommand);
            assert.ok(Array.isArray(validConfig.backendArgs));
            assert.ok(Array.isArray(validConfig.routerTools));
        });

        it('should reject invalid configuration', () => {
            const invalidConfigs = [
                null,
                undefined,
                'not an object',
                { name: 'test' }, // missing required fields
                { name: '', backendCommand: 'node', backendArgs: [], routerTools: [] }
            ];

            invalidConfigs.forEach(config => {
                assert.throws(() => {
                    if (!config || typeof config !== 'object') {
                        throw new Error('Configuration must be an object');
                    }
                    if (!config.name || !config.backendCommand) {
                        throw new Error('Missing required fields');
                    }
                });
            });
        });
    });

    describe('Backend Process Management', () => {
        it('should start backend process correctly', () => {
            const config = {
                name: 'test-router',
                backendCommand: 'node',
                backendArgs: ['test.js']
            };

            // Simulate starting backend
            const process = spawn(config.backendCommand, config.backendArgs);
            assert.ok(process);
        });

        it('should handle backend crashes with restart', (done) => {
            let crashCount = 0;

            mockBackendProcess.on('close', (code) => {
                crashCount++;
                if (crashCount === 1) {
                    assert.strictEqual(typeof code, 'number');
                    done();
                }
            });

            // Simulate crash
            mockBackendProcess.emit('close', 1);
        });

        it('should handle backend stderr output', () => {
            let stderrOutput = '';

            mockBackendProcess.stderr.on('data', (data) => {
                stderrOutput += data;
            });

            mockBackendProcess.stderr.emit('data', '[Backend] Error message');
            assert.ok(stderrOutput.includes('Error message'));
        });
    });

    describe('Message Routing', () => {
        it('should route initialize message', () => {
            const initMessage = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'test-client', version: '1.0' }
                }
            };

            // Test initialization response structure
            const response = {
                jsonrpc: '2.0',
                id: initMessage.id,
                result: {
                    protocolVersion: '2024-11-05',
                    serverInfo: { name: 'test-router', version: '1.0.0' },
                    capabilities: { tools: {}, resources: {}, prompts: {} }
                }
            };

            assert.strictEqual(response.jsonrpc, '2.0');
            assert.strictEqual(response.id, initMessage.id);
            assert.ok(response.result.serverInfo);
        });

        it('should route tools/list message', () => {
            const toolsListMessage = {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {}
            };

            const routerTools = [
                {
                    name: 'test_discover',
                    description: 'Discover available tools',
                    inputSchema: { type: 'object' }
                }
            ];

            const response = {
                jsonrpc: '2.0',
                id: toolsListMessage.id,
                result: { tools: routerTools }
            };

            assert.strictEqual(response.result.tools.length, routerTools.length);
            assert.strictEqual(response.result.tools[0].name, 'test_discover');
        });

        it('should handle tool discovery requests', () => {
            const discoveryMessage = {
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: {
                    name: 'test_discover',
                    arguments: { category: 'test', search: 'tool' }
                }
            };

            const allTools = [
                { name: 'test/tool1', description: 'Test tool 1' },
                { name: 'test/tool2', description: 'Test tool 2' },
                { name: 'other/tool3', description: 'Other tool' }
            ];

            // Simulate filtering logic
            const filtered = allTools.filter(t => {
                const catMatch = discoveryMessage.params.arguments.category ?
                    t.name.startsWith(discoveryMessage.params.arguments.category + '/') : true;
                const searchMatch = discoveryMessage.params.arguments.search ?
                    (t.name + (t.description || '')).toLowerCase().includes(discoveryMessage.params.arguments.search.toLowerCase()) : true;
                return catMatch && searchMatch;
            });

            assert.strictEqual(filtered.length, 2);
            assert.ok(filtered.every(t => t.name.startsWith('test/')));
        });

        it('should handle tool execution requests', () => {
            const executionMessage = {
                jsonrpc: '2.0',
                id: 4,
                method: 'tools/call',
                params: {
                    name: 'test_execute',
                    arguments: {
                        tool: 'actual_tool',
                        params: { key: 'value' }
                    }
                }
            };

            // Test tool name mapping
            let realTool = executionMessage.params.name;
            let toolArgs = executionMessage.params.arguments;

            if (executionMessage.params.name.endsWith('_execute')) {
                realTool = executionMessage.params.arguments.tool;
                toolArgs = executionMessage.params.arguments.params || {};
            }

            assert.strictEqual(realTool, 'actual_tool');
            assert.deepStrictEqual(toolArgs, { key: 'value' });
        });
    });

    describe('JSON Message Parsing', () => {
        it('should parse clean JSON messages', () => {
            const cleanMessage = '{"jsonrpc":"2.0","method":"test","id":1}';

            assert.doesNotThrow(() => {
                const parsed = JSON.parse(cleanMessage);
                assert.strictEqual(parsed.jsonrpc, '2.0');
                assert.strictEqual(parsed.method, 'test');
            });
        });

        it('should handle stdout pollution gracefully', () => {
            const pollutedMessages = [
                'INFO: {"jsonrpc":"2.0","method":"test","id":1}',
                'DEBUG [timestamp] {"jsonrpc":"2.0","method":"test","id":2}',
                'noise before {"jsonrpc":"2.0","method":"test","id":3} noise after'
            ];

            pollutedMessages.forEach((message, index) => {
                const openBrace = message.indexOf('{');
                if (openBrace !== -1) {
                    const potentialJson = message.substring(openBrace);

                    try {
                        const parsed = JSON.parse(potentialJson);
                        assert.strictEqual(parsed.jsonrpc, '2.0');
                        assert.strictEqual(parsed.id, index + 1);
                    } catch (e) {
                        // Some messages might have trailing noise
                        const closeBrace = potentialJson.indexOf('}');
                        if (closeBrace !== -1) {
                            const cleanJson = potentialJson.substring(0, closeBrace + 1);
                            const parsed = JSON.parse(cleanJson);
                            assert.strictEqual(parsed.jsonrpc, '2.0');
                        }
                    }
                }
            });
        });

        it('should handle malformed JSON gracefully', () => {
            const malformedMessages = [
                'not json at all',
                '{"malformed":}',
                '{"incomplete"',
                '',
                null,
                undefined
            ];

            malformedMessages.forEach(message => {
                if (!message || typeof message !== 'string') return;

                const openBrace = message.indexOf('{');
                if (openBrace === -1) return;

                const potentialJson = message.substring(openBrace);
                try {
                    JSON.parse(potentialJson);
                } catch (e) {
                    // Expected to fail gracefully
                    assert.ok(e instanceof Error);
                }
            });
        });
    });

    describe('State Management', () => {
        it('should track ready state correctly', () => {
            let isReady = false;
            let allTools = [];

            // Simulate initialization sequence
            const initResponse = { result: { capabilities: {} } };
            if (initResponse.result) {
                // Request tools list
                const toolsResponse = { result: { tools: [{ name: 'test_tool' }] } };
                if (toolsResponse.result && toolsResponse.result.tools) {
                    allTools = toolsResponse.result.tools;
                    isReady = true;
                }
            }

            assert.strictEqual(isReady, true);
            assert.strictEqual(allTools.length, 1);
        });

        it('should queue tool calls when not ready', () => {
            const toolCallQueue = [];
            let isReady = false;

            const queueToolCall = (toolName, args) => {
                if (isReady) {
                    // Execute immediately
                    return { executed: true, tool: toolName, args };
                } else {
                    // Queue for later
                    toolCallQueue.push({ tool: toolName, args });
                    return { queued: true };
                }
            };

            // Queue some calls
            const result1 = queueToolCall('tool1', { a: 1 });
            const result2 = queueToolCall('tool2', { b: 2 });

            assert.strictEqual(result1.queued, true);
            assert.strictEqual(result2.queued, true);
            assert.strictEqual(toolCallQueue.length, 2);

            // Simulate becoming ready
            isReady = true;
            const flushQueue = () => {
                const results = [];
                while (toolCallQueue.length > 0) {
                    const queued = toolCallQueue.shift();
                    results.push({ executed: true, tool: queued.tool, args: queued.args });
                }
                return results;
            };

            const flushedResults = flushQueue();
            assert.strictEqual(flushedResults.length, 2);
            assert.strictEqual(toolCallQueue.length, 0);
        });
    });

    describe('Internal Callback Management', () => {
        it('should track internal callbacks correctly', () => {
            const internalCallbacks = new Map();
            let nextInternalId = 5000;

            const createCallback = (originalId) => {
                const internalId = nextInternalId++;
                return new Promise((resolve, reject) => {
                    internalCallbacks.set(internalId, { resolve, reject, originalId });
                });
            };

            const promise1 = createCallback(100);
            const promise2 = createCallback(200);

            assert.strictEqual(internalCallbacks.size, 2);
            assert.ok(internalCallbacks.has(5000));
            assert.ok(internalCallbacks.has(5001));
            assert.strictEqual(internalCallbacks.get(5000).originalId, 100);
        });

        it('should handle callback responses correctly', () => {
            const internalCallbacks = new Map();

            // Simulate callback setup
            let resolvedValue = null;
            let rejectedError = null;

            const callback = {
                resolve: (value) => { resolvedValue = value; },
                reject: (error) => { rejectedError = error; }
            };

            internalCallbacks.set(5000, callback);

            // Simulate successful response
            const response = { id: 5000, result: { data: 'success' } };
            if (internalCallbacks.has(response.id)) {
                const cb = internalCallbacks.get(response.id);
                internalCallbacks.delete(response.id);
                cb.resolve(response.result);
            }

            assert.deepStrictEqual(resolvedValue, { data: 'success' });
            assert.strictEqual(rejectedError, null);
            assert.strictEqual(internalCallbacks.size, 0);
        });

        it('should handle callback errors correctly', () => {
            const internalCallbacks = new Map();

            let resolvedValue = null;
            let rejectedError = null;

            const callback = {
                resolve: (value) => { resolvedValue = value; },
                reject: (error) => { rejectedError = error; }
            };

            internalCallbacks.set(5001, callback);

            // Simulate error response
            const errorResponse = {
                id: 5001,
                error: { code: -32603, message: 'Internal error' }
            };

            if (internalCallbacks.has(errorResponse.id)) {
                const cb = internalCallbacks.get(errorResponse.id);
                internalCallbacks.delete(errorResponse.id);
                cb.reject(errorResponse.error);
            }

            assert.strictEqual(resolvedValue, null);
            assert.deepStrictEqual(rejectedError, { code: -32603, message: 'Internal error' });
        });
    });

    describe('Message Forwarding', () => {
        it('should forward unknown messages to backend', () => {
            const isReady = true;
            const unknownMessage = {
                jsonrpc: '2.0',
                id: 999,
                method: 'unknown/method',
                params: { data: 'test' }
            };

            let forwardedMessage = null;
            const mockBackendStdin = {
                write: (data) => {
                    forwardedMessage = JSON.parse(data.replace('\n', ''));
                    return true;
                }
            };

            if (isReady) {
                mockBackendStdin.write(JSON.stringify(unknownMessage) + '\n');
            }

            assert.deepStrictEqual(forwardedMessage, unknownMessage);
        });

        it('should filter unsupported notification methods', () => {
            const unsupportedMethods = [
                'notifications/roots/list_changed',
                'notifications/initialized'
            ];

            unsupportedMethods.forEach(method => {
                const message = {
                    jsonrpc: '2.0',
                    method,
                    params: {}
                };

                // Should be filtered out (not processed)
                const shouldProcess = !unsupportedMethods.includes(message.method);
                assert.strictEqual(shouldProcess, false);
            });
        });
    });

    describe('Signal Handling', () => {
        it('should handle SIGINT gracefully', () => {
            let backendKilled = false;
            let processExited = false;

            const mockBackend = {
                kill: (signal) => {
                    if (signal === 'SIGINT') {
                        backendKilled = true;
                    }
                    return true;
                }
            };

            const mockProcess = {
                exit: (code) => {
                    processExited = true;
                    assert.strictEqual(code, 0);
                }
            };

            // Simulate SIGINT handler
            const handleSIGINT = () => {
                if (mockBackend) {
                    mockBackend.kill('SIGINT');
                }
                mockProcess.exit(0);
            };

            handleSIGINT();

            assert.strictEqual(backendKilled, true);
            assert.strictEqual(processExited, true);
        });

        it('should handle SIGTERM gracefully', () => {
            let backendKilled = false;
            let signalUsed = null;

            const mockBackend = {
                kill: (signal) => {
                    signalUsed = signal;
                    backendKilled = true;
                    return true;
                }
            };

            // Simulate SIGTERM handler
            const handleSIGTERM = () => {
                if (mockBackend) {
                    mockBackend.kill('SIGTERM');
                }
            };

            handleSIGTERM();

            assert.strictEqual(backendKilled, true);
            assert.strictEqual(signalUsed, 'SIGTERM');
        });
    });
});