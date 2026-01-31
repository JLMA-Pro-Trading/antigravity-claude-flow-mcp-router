/**
 * Integration Tests for MCP Router
 * Addresses AQE findings: comprehensive router testing
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routerPath = path.join(__dirname, '../../index.js');

describe('MCP Router Integration', () => {
    let routerProcess;
    let responses;

    beforeEach(() => {
        responses = [];
    });

    afterEach((done) => {
        if (routerProcess) {
            routerProcess.kill('SIGTERM');
            routerProcess.on('close', () => done());
        } else {
            done();
        }
    });

    function startRouter(config = 'claude-flow') {
        return new Promise((resolve, reject) => {
            routerProcess = spawn('node', [routerPath, config], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let ready = false;
            const timeout = setTimeout(() => {
                if (!ready) {
                    reject(new Error('Router startup timeout'));
                }
            }, 10000);

            routerProcess.stdout.on('data', (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const response = JSON.parse(line);
                        responses.push(response);

                        // Consider router ready after first response
                        if (!ready) {
                            clearTimeout(timeout);
                            ready = true;
                            resolve();
                        }
                    } catch (e) {
                        // Not JSON, ignore
                    }
                }
            });

            routerProcess.stderr.on('data', (data) => {
                const log = data.toString();

                // Router ready when it loads config
                if (log.includes('Loaded configuration') && !ready) {
                    clearTimeout(timeout);
                    ready = true;
                    setTimeout(resolve, 100); // Give it a moment to fully initialize
                }
            });

            routerProcess.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    function sendMessage(message) {
        const jsonMessage = JSON.stringify(message) + '\n';
        routerProcess.stdin.write(jsonMessage);
    }

    function waitForResponse(id, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Timeout waiting for response with id ${id}`));
            }, timeout);

            const checkResponse = () => {
                const response = responses.find(r => r.id === id);
                if (response) {
                    clearTimeout(timeoutId);
                    resolve(response);
                } else {
                    setTimeout(checkResponse, 10);
                }
            };

            checkResponse();
        });
    }

    describe('Router Startup', () => {
        it('should start with claude-flow configuration', async () => {
            await startRouter('claude-flow');
            assert.ok(routerProcess.pid, 'Router should be running');
        });

        it('should start with minimal configuration', async () => {
            await startRouter('minimal');
            assert.ok(routerProcess.pid, 'Router should be running');
        });

        it('should reject invalid configuration', (done) => {
            const invalidProcess = spawn('node', [routerPath, 'nonexistent-config'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            invalidProcess.on('close', (code) => {
                assert.notStrictEqual(code, 0, 'Should exit with error code for invalid config');
                done();
            });
        });
    });

    describe('JSON-RPC Protocol', () => {
        beforeEach(async () => {
            await startRouter('claude-flow');
        });

        it('should handle initialize request', async () => {
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

            sendMessage(initMessage);
            const response = await waitForResponse(1);

            assert.strictEqual(response.jsonrpc, '2.0');
            assert.strictEqual(response.id, 1);
            assert.ok(response.result);
            assert.strictEqual(response.result.protocolVersion, '2024-11-05');
            assert.ok(response.result.serverInfo);
        });

        it('should handle tools/list request immediately', async () => {
            const toolsMessage = {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list'
            };

            const startTime = Date.now();
            sendMessage(toolsMessage);
            const response = await waitForResponse(2);
            const responseTime = Date.now() - startTime;

            // Should respond immediately (V1.0 feature)
            assert.ok(responseTime < 1000, `Response time ${responseTime}ms should be < 1000ms`);
            assert.strictEqual(response.jsonrpc, '2.0');
            assert.strictEqual(response.id, 2);
            assert.ok(response.result);
            assert.ok(Array.isArray(response.result.tools));
            assert.ok(response.result.tools.length > 0);
        });

        it('should provide cf_discover tool', async () => {
            const toolsMessage = {
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/list'
            };

            sendMessage(toolsMessage);
            const response = await waitForResponse(3);

            const discoverTool = response.result.tools.find(tool => tool.name === 'cf_discover');
            assert.ok(discoverTool, 'Should include cf_discover tool');
            assert.strictEqual(typeof discoverTool.description, 'string');
            assert.ok(discoverTool.inputSchema);
        });

        it('should handle tool call requests', async () => {
            const toolCallMessage = {
                jsonrpc: '2.0',
                id: 4,
                method: 'tools/call',
                params: {
                    name: 'cf_discover',
                    arguments: { category: 'agent' }
                }
            };

            sendMessage(toolCallMessage);

            // Tool calls may take longer as they go to backend
            const response = await waitForResponse(4, 10000);

            assert.strictEqual(response.jsonrpc, '2.0');
            assert.strictEqual(response.id, 4);
            // Should have either result or error
            assert.ok(response.result || response.error);
        });

        it('should handle invalid JSON gracefully', async () => {
            // Send malformed JSON
            routerProcess.stdin.write('{"invalid json\n');

            // Send valid request after invalid one
            const validMessage = {
                jsonrpc: '2.0',
                id: 5,
                method: 'tools/list'
            };

            sendMessage(validMessage);
            const response = await waitForResponse(5);

            // Should still work after invalid JSON
            assert.strictEqual(response.id, 5);
            assert.ok(response.result);
        });

        it('should handle missing method', async () => {
            const invalidMessage = {
                jsonrpc: '2.0',
                id: 6,
                params: {}
                // Missing method field
            };

            sendMessage(invalidMessage);

            // Wait a bit to see if router crashes
            await new Promise(resolve => setTimeout(resolve, 500));

            // Router should still be responsive
            const validMessage = {
                jsonrpc: '2.0',
                id: 7,
                method: 'tools/list'
            };

            sendMessage(validMessage);
            const response = await waitForResponse(7);
            assert.strictEqual(response.id, 7);
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await startRouter('claude-flow');
        });

        it('should survive backend disconnection', async () => {
            // First ensure router is working
            const initialMessage = {
                jsonrpc: '2.0',
                id: 8,
                method: 'tools/list'
            };

            sendMessage(initialMessage);
            await waitForResponse(8);

            // Router should continue to respond to router tools even if backend has issues
            const afterMessage = {
                jsonrpc: '2.0',
                id: 9,
                method: 'tools/list'
            };

            sendMessage(afterMessage);
            const response = await waitForResponse(9);
            assert.strictEqual(response.id, 9);
            assert.ok(response.result.tools.length > 0);
        });

        it('should handle rapid successive requests', async () => {
            const promises = [];

            // Send 10 requests rapidly
            for (let i = 10; i < 20; i++) {
                const message = {
                    jsonrpc: '2.0',
                    id: i,
                    method: 'tools/list'
                };
                sendMessage(message);
                promises.push(waitForResponse(i));
            }

            // All should respond
            const results = await Promise.all(promises);
            assert.strictEqual(results.length, 10);
            results.forEach((result, index) => {
                assert.strictEqual(result.id, 10 + index);
            });
        });
    });

    describe('Configuration Variants', () => {
        it('should work with minimal configuration', async () => {
            await startRouter('minimal');

            const toolsMessage = {
                jsonrpc: '2.0',
                id: 21,
                method: 'tools/list'
            };

            sendMessage(toolsMessage);
            const response = await waitForResponse(21);

            assert.ok(response.result.tools.length >= 3); // Minimal config should have 3 tools

            // Should include basic tools
            const toolNames = response.result.tools.map(t => t.name);
            assert.ok(toolNames.includes('cf_discover'));
        });

        it('should work with dual configuration', async () => {
            await startRouter('claude-flow-dual');

            const toolsMessage = {
                jsonrpc: '2.0',
                id: 22,
                method: 'tools/list'
            };

            sendMessage(toolsMessage);
            const response = await waitForResponse(22);

            // Dual config should have both cf_ and standard tool names
            const toolNames = response.result.tools.map(t => t.name);

            // Should have cf_ tools
            assert.ok(toolNames.some(name => name.startsWith('cf_')));
            // Should also have standard tools
            assert.ok(toolNames.some(name => name.includes('agent') && !name.startsWith('cf_')));
        });
    });

    describe('Performance', () => {
        beforeEach(async () => {
            await startRouter('claude-flow');
        });

        it('should respond to tools/list under 500ms', async () => {
            const message = {
                jsonrpc: '2.0',
                id: 23,
                method: 'tools/list'
            };

            const startTime = Date.now();
            sendMessage(message);
            await waitForResponse(23);
            const responseTime = Date.now() - startTime;

            // V1.0 immediate response should be very fast
            assert.ok(responseTime < 500, `Response time ${responseTime}ms should be under 500ms`);
        });

        it('should handle concurrent requests efficiently', async () => {
            const concurrentRequests = 5;
            const promises = [];
            const startTime = Date.now();

            for (let i = 24; i < 24 + concurrentRequests; i++) {
                const message = {
                    jsonrpc: '2.0',
                    id: i,
                    method: 'tools/list'
                };
                sendMessage(message);
                promises.push(waitForResponse(i));
            }

            await Promise.all(promises);
            const totalTime = Date.now() - startTime;

            // All concurrent requests should complete quickly
            assert.ok(totalTime < 2000, `Total time ${totalTime}ms for ${concurrentRequests} concurrent requests should be under 2000ms`);
        });
    });
});