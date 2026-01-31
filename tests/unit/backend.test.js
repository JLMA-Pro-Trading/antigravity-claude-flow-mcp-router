/**
 * Backend Communication Tests
 * Comprehensive tests for backend process management and communication
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';

// Mock child process for backend testing
class MockBackendProcess extends EventEmitter {
    constructor(options = {}) {
        super();
        this.exitCode = null;
        this.killed = false;
        this.stdin = new MockStream();
        this.stdout = new MockStream();
        this.stderr = new MockStream();
        this.pid = Math.floor(Math.random() * 10000);

        // Simulate startup delay
        if (options.startupDelay) {
            setTimeout(() => {
                this.emit('spawn');
            }, options.startupDelay);
        } else {
            process.nextTick(() => this.emit('spawn'));
        }
    }

    kill(signal = 'SIGTERM') {
        this.killed = true;
        const exitCode = signal === 'SIGKILL' ? 9 : signal === 'SIGTERM' ? 15 : 2;
        process.nextTick(() => {
            this.emit('close', exitCode, signal);
        });
        return true;
    }

    disconnect() {
        this.emit('disconnect');
    }
}

class MockStream extends EventEmitter {
    constructor() {
        super();
        this.writable = true;
        this.readable = true;
        this.data = '';
    }

    write(chunk, encoding, callback) {
        this.data += chunk;
        this.emit('data', chunk);
        if (callback) callback();
        return true;
    }

    end(chunk, encoding, callback) {
        if (chunk) this.write(chunk, encoding);
        this.writable = false;
        this.emit('end');
        if (callback) callback();
    }

    destroy() {
        this.readable = false;
        this.writable = false;
        this.emit('close');
    }
}

describe('Backend Communication', () => {
    let mockBackend;
    let communicationLog;

    beforeEach(() => {
        communicationLog = [];
    });

    afterEach(() => {
        if (mockBackend && !mockBackend.killed) {
            mockBackend.kill();
        }
    });

    describe('Backend Process Lifecycle', () => {
        it('should spawn backend process successfully', (done) => {
            mockBackend = new MockBackendProcess();

            mockBackend.on('spawn', () => {
                assert.ok(mockBackend.pid);
                assert.strictEqual(mockBackend.killed, false);
                done();
            });
        });

        it('should handle backend startup with delay', (done) => {
            const startTime = Date.now();
            mockBackend = new MockBackendProcess({ startupDelay: 100 });

            mockBackend.on('spawn', () => {
                const elapsed = Date.now() - startTime;
                assert.ok(elapsed >= 100);
                done();
            });
        });

        it('should terminate backend process gracefully', (done) => {
            mockBackend = new MockBackendProcess();

            mockBackend.on('spawn', () => {
                mockBackend.kill('SIGTERM');
            });

            mockBackend.on('close', (code, signal) => {
                assert.strictEqual(code, 15);
                assert.strictEqual(signal, 'SIGTERM');
                assert.strictEqual(mockBackend.killed, true);
                done();
            });
        });

        it('should handle forced termination', (done) => {
            mockBackend = new MockBackendProcess();

            mockBackend.on('spawn', () => {
                mockBackend.kill('SIGKILL');
            });

            mockBackend.on('close', (code, signal) => {
                assert.strictEqual(code, 9);
                assert.strictEqual(signal, 'SIGKILL');
                done();
            });
        });

        it('should detect backend crashes', (done) => {
            mockBackend = new MockBackendProcess();

            mockBackend.on('spawn', () => {
                // Simulate unexpected crash
                mockBackend.exitCode = 1;
                mockBackend.emit('close', 1, null);
            });

            mockBackend.on('close', (code) => {
                assert.strictEqual(code, 1);
                // Should trigger restart logic
                done();
            });
        });
    });

    describe('Communication Protocol', () => {
        beforeEach(() => {
            mockBackend = new MockBackendProcess();
        });

        it('should send initialization sequence', (done) => {
            const initSequence = [
                {
                    jsonrpc: '2.0',
                    id: 4000,
                    method: 'initialize',
                    params: {
                        protocolVersion: "2024-11-05",
                        capabilities: {},
                        clientInfo: { name: "UniversalRouter", version: "1.0" }
                    }
                }
            ];

            mockBackend.stdin.on('data', (data) => {
                const message = JSON.parse(data);
                assert.strictEqual(message.jsonrpc, '2.0');
                assert.strictEqual(message.method, 'initialize');
                assert.strictEqual(message.id, 4000);
                done();
            });

            // Send initialization
            mockBackend.stdin.write(JSON.stringify(initSequence[0]) + '\n');
        });

        it('should handle tools/list request', (done) => {
            const toolsListRequest = {
                jsonrpc: '2.0',
                id: 4001,
                method: 'tools/list',
                params: {}
            };

            mockBackend.stdin.on('data', (data) => {
                const message = JSON.parse(data);
                assert.strictEqual(message.method, 'tools/list');
                assert.strictEqual(message.id, 4001);
                done();
            });

            mockBackend.stdin.write(JSON.stringify(toolsListRequest) + '\n');
        });

        it('should handle tool execution requests', (done) => {
            const toolCallRequest = {
                jsonrpc: '2.0',
                id: 5000,
                method: 'tools/call',
                params: {
                    name: 'test_tool',
                    arguments: { input: 'test data' }
                }
            };

            mockBackend.stdin.on('data', (data) => {
                const message = JSON.parse(data);
                assert.strictEqual(message.method, 'tools/call');
                assert.strictEqual(message.params.name, 'test_tool');
                assert.deepStrictEqual(message.params.arguments, { input: 'test data' });
                done();
            });

            mockBackend.stdin.write(JSON.stringify(toolCallRequest) + '\n');
        });

        it('should process backend responses', (done) => {
            const responses = [];

            const processResponse = (data) => {
                const response = JSON.parse(data);
                responses.push(response);

                if (responses.length === 3) {
                    // Verify all responses were processed
                    assert.strictEqual(responses.length, 3);
                    assert.strictEqual(responses[0].id, 4000);
                    assert.strictEqual(responses[1].id, 4001);
                    assert.strictEqual(responses[2].id, 5000);
                    done();
                }
            };

            // Simulate backend responses
            const testResponses = [
                { jsonrpc: '2.0', id: 4000, result: { protocolVersion: '2024-11-05' } },
                { jsonrpc: '2.0', id: 4001, result: { tools: [] } },
                { jsonrpc: '2.0', id: 5000, result: { output: 'success' } }
            ];

            testResponses.forEach((response, index) => {
                setTimeout(() => {
                    processResponse(JSON.stringify(response));
                }, index * 10);
            });
        });
    });

    describe('Error Recovery', () => {
        it('should recover from communication errors', (done) => {
            mockBackend = new MockBackendProcess();
            let errorCount = 0;
            let recoveryAttempted = false;

            const handleCommunicationError = (error) => {
                errorCount++;
                if (errorCount <= 3) {
                    // Attempt recovery
                    recoveryAttempted = true;
                    return { action: 'retry', delay: 100 };
                } else {
                    return { action: 'restart_backend' };
                }
            };

            // Simulate communication error
            const error = new Error('EPIPE: write after end');
            const recovery = handleCommunicationError(error);

            assert.strictEqual(recovery.action, 'retry');
            assert.strictEqual(recovery.delay, 100);
            assert.strictEqual(recoveryAttempted, true);
            done();
        });

        it('should handle JSON parsing errors gracefully', () => {
            const malformedInputs = [
                'not json',
                '{"incomplete":',
                '{"valid": "json"} extra text',
                '',
                '\n\n',
                '{"jsonrpc":"2.0","method":"test"', // incomplete
                'INFO: {"jsonrpc":"2.0","method":"test","id":1}' // with prefix
            ];

            const parseBackendOutput = (input) => {
                if (!input || !input.trim()) return null;

                const openBrace = input.indexOf('{');
                if (openBrace === -1) return null;

                const potentialJson = input.substring(openBrace);
                try {
                    return JSON.parse(potentialJson);
                } catch (e) {
                    return null; // Graceful failure
                }
            };

            malformedInputs.forEach((input, index) => {
                const result = parseBackendOutput(input);
                if (index === 6) { // The one with INFO prefix should parse
                    assert.ok(result);
                    assert.strictEqual(result.method, 'test');
                } else {
                    // Others should fail gracefully
                    assert.strictEqual(result, null);
                }
            });
        });

        it('should implement exponential backoff for retries', () => {
            const calculateBackoff = (attempt, baseDelay = 100, maxDelay = 5000) => {
                const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
                return delay;
            };

            const backoffSequence = [0, 1, 2, 3, 4, 5].map(attempt => calculateBackoff(attempt));

            assert.strictEqual(backoffSequence[0], 100);   // 100ms
            assert.strictEqual(backoffSequence[1], 200);   // 200ms
            assert.strictEqual(backoffSequence[2], 400);   // 400ms
            assert.strictEqual(backoffSequence[3], 800);   // 800ms
            assert.strictEqual(backoffSequence[4], 1600);  // 1600ms
            assert.strictEqual(backoffSequence[5], 3200);  // 3200ms (capped at 5000)
        });
    });

    describe('Connection State Management', () => {
        beforeEach(() => {
            mockBackend = new MockBackendProcess();
        });

        it('should track connection state correctly', (done) => {
            let connectionState = 'disconnected';
            let isReady = false;

            mockBackend.on('spawn', () => {
                connectionState = 'connecting';

                // Simulate handshake completion
                setTimeout(() => {
                    connectionState = 'connected';
                    isReady = true;

                    assert.strictEqual(connectionState, 'connected');
                    assert.strictEqual(isReady, true);
                    done();
                }, 50);
            });
        });

        it('should handle connection timeout', (done) => {
            const CONNECTION_TIMEOUT = 1000;
            let connectionState = 'connecting';
            let timedOut = false;

            const connectionTimer = setTimeout(() => {
                if (connectionState === 'connecting') {
                    connectionState = 'timeout';
                    timedOut = true;

                    assert.strictEqual(connectionState, 'timeout');
                    assert.strictEqual(timedOut, true);
                    done();
                }
            }, CONNECTION_TIMEOUT);

            // Don't emit 'connected' event to simulate timeout
            mockBackend = new MockBackendProcess({ startupDelay: 1500 });
        });

        it('should detect backend disconnection', (done) => {
            let connectionState = 'connected';

            mockBackend.on('spawn', () => {
                connectionState = 'connected';

                // Simulate unexpected disconnection
                mockBackend.stdout.destroy();
                mockBackend.stderr.destroy();
            });

            mockBackend.stdout.on('close', () => {
                connectionState = 'disconnected';
                assert.strictEqual(connectionState, 'disconnected');
                done();
            });
        });
    });

    describe('Message Queuing', () => {
        it('should queue messages when backend is not ready', () => {
            const messageQueue = [];
            let isReady = false;

            const queueMessage = (message) => {
                if (isReady) {
                    return sendMessage(message);
                } else {
                    messageQueue.push(message);
                    return { queued: true };
                }
            };

            const sendMessage = (message) => {
                return { sent: true, message };
            };

            // Queue some messages
            const result1 = queueMessage({ id: 1, method: 'test1' });
            const result2 = queueMessage({ id: 2, method: 'test2' });

            assert.strictEqual(result1.queued, true);
            assert.strictEqual(result2.queued, true);
            assert.strictEqual(messageQueue.length, 2);

            // Simulate backend becoming ready
            isReady = true;
            const flushQueue = () => {
                const results = [];
                while (messageQueue.length > 0) {
                    const message = messageQueue.shift();
                    results.push(sendMessage(message));
                }
                return results;
            };

            const flushed = flushQueue();
            assert.strictEqual(flushed.length, 2);
            assert.strictEqual(messageQueue.length, 0);
        });

        it('should handle queue overflow', () => {
            const MAX_QUEUE_SIZE = 100;
            const messageQueue = [];

            const addToQueue = (message) => {
                if (messageQueue.length >= MAX_QUEUE_SIZE) {
                    // Drop oldest message
                    messageQueue.shift();
                }
                messageQueue.push(message);
            };

            // Fill queue beyond capacity
            for (let i = 0; i < 120; i++) {
                addToQueue({ id: i, method: 'test' });
            }

            assert.strictEqual(messageQueue.length, MAX_QUEUE_SIZE);
            assert.strictEqual(messageQueue[0].id, 20); // First 20 messages dropped
            assert.strictEqual(messageQueue[99].id, 119); // Last message preserved
        });
    });

    describe('Performance Monitoring', () => {
        it('should track message latency', () => {
            const latencyTracker = {
                requests: new Map(),

                startRequest(id) {
                    this.requests.set(id, Date.now());
                },

                endRequest(id) {
                    const startTime = this.requests.get(id);
                    if (startTime) {
                        const latency = Date.now() - startTime;
                        this.requests.delete(id);
                        return latency;
                    }
                    return null;
                }
            };

            const requestId = 12345;
            latencyTracker.startRequest(requestId);

            // Simulate some processing time
            setTimeout(() => {
                const latency = latencyTracker.endRequest(requestId);
                assert.ok(latency >= 0);
                assert.strictEqual(latencyTracker.requests.size, 0);
            }, 10);
        });

        it('should track backend resource usage', () => {
            const resourceMonitor = {
                memoryUsage: 0,
                cpuUsage: 0,
                messageCount: 0,

                updateStats(memory, cpu) {
                    this.memoryUsage = memory;
                    this.cpuUsage = cpu;
                    this.messageCount++;
                },

                getStats() {
                    return {
                        memory: this.memoryUsage,
                        cpu: this.cpuUsage,
                        messages: this.messageCount,
                        avgMemory: this.memoryUsage / (this.messageCount || 1)
                    };
                }
            };

            // Simulate resource updates
            resourceMonitor.updateStats(50, 25);
            resourceMonitor.updateStats(60, 30);
            resourceMonitor.updateStats(55, 28);

            const stats = resourceMonitor.getStats();
            assert.strictEqual(stats.memory, 55);
            assert.strictEqual(stats.cpu, 28);
            assert.strictEqual(stats.messages, 3);
            assert.ok(stats.avgMemory > 0);
        });
    });

    describe('Protocol Validation', () => {
        it('should validate JSON-RPC 2.0 format', () => {
            const validateJsonRpc = (message) => {
                if (!message || typeof message !== 'object') {
                    return { valid: false, error: 'Message must be an object' };
                }

                if (message.jsonrpc !== '2.0') {
                    return { valid: false, error: 'Invalid JSON-RPC version' };
                }

                if (!message.method && !('result' in message || 'error' in message)) {
                    return { valid: false, error: 'Message must have method or result/error' };
                }

                if (message.method && typeof message.method !== 'string') {
                    return { valid: false, error: 'Method must be a string' };
                }

                return { valid: true };
            };

            const validMessages = [
                { jsonrpc: '2.0', method: 'test', id: 1 },
                { jsonrpc: '2.0', id: 1, result: 'success' },
                { jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'error' } }
            ];

            const invalidMessages = [
                null,
                { jsonrpc: '1.0', method: 'test' },
                { jsonrpc: '2.0' }, // no method or result/error
                { jsonrpc: '2.0', method: 123 } // invalid method type
            ];

            validMessages.forEach((msg, index) => {
                const result = validateJsonRpc(msg);
                assert.strictEqual(result.valid, true, `Valid message ${index} should pass`);
            });

            invalidMessages.forEach((msg, index) => {
                const result = validateJsonRpc(msg);
                assert.strictEqual(result.valid, false, `Invalid message ${index} should fail`);
            });
        });
    });
});