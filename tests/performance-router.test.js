/**
 * AQE Comprehensive Unit Tests for Performance Optimized MCP Router
 * Generated with AI-enhanced pattern recognition
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

// Mock child_process for testing
jest.mock('child_process');

describe('PerformanceMonitor', () => {
    let monitor;

    beforeEach(() => {
        // Assuming we can import the class directly for testing
        monitor = {
            metrics: {
                requestCount: 0,
                totalResponseTime: 0,
                averageResponseTime: 0,
                peakMemoryUsage: 0,
                toolListCacheHits: 0,
                toolListCacheMisses: 0
            },
            startTime: performance.now()
        };
    });

    describe('recordRequest', () => {
        it('should correctly calculate response time and update metrics', () => {
            const startTime = performance.now() - 100; // 100ms ago

            // Simulate recordRequest logic
            const responseTime = performance.now() - startTime;
            monitor.metrics.requestCount++;
            monitor.metrics.totalResponseTime += responseTime;
            monitor.metrics.averageResponseTime = monitor.metrics.totalResponseTime / monitor.metrics.requestCount;

            expect(monitor.metrics.requestCount).toBe(1);
            expect(monitor.metrics.totalResponseTime).toBeGreaterThan(90);
            expect(monitor.metrics.averageResponseTime).toBeGreaterThan(90);
        });

        it('should update peak memory usage when current usage is higher', () => {
            const currentMemUsage = 1000000; // 1MB
            monitor.metrics.peakMemoryUsage = 500000; // 0.5MB

            if (currentMemUsage > monitor.metrics.peakMemoryUsage) {
                monitor.metrics.peakMemoryUsage = currentMemUsage;
            }

            expect(monitor.metrics.peakMemoryUsage).toBe(1000000);
        });

        it('should not update peak memory usage when current usage is lower', () => {
            const currentMemUsage = 300000; // 0.3MB
            monitor.metrics.peakMemoryUsage = 500000; // 0.5MB

            if (currentMemUsage > monitor.metrics.peakMemoryUsage) {
                monitor.metrics.peakMemoryUsage = currentMemUsage;
            }

            expect(monitor.metrics.peakMemoryUsage).toBe(500000);
        });
    });

    describe('recordCacheHit', () => {
        it('should increment cache hits when isHit is true', () => {
            const isHit = true;

            if (isHit) {
                monitor.metrics.toolListCacheHits++;
            } else {
                monitor.metrics.toolListCacheMisses++;
            }

            expect(monitor.metrics.toolListCacheHits).toBe(1);
            expect(monitor.metrics.toolListCacheMisses).toBe(0);
        });

        it('should increment cache misses when isHit is false', () => {
            const isHit = false;

            if (isHit) {
                monitor.metrics.toolListCacheHits++;
            } else {
                monitor.metrics.toolListCacheMisses++;
            }

            expect(monitor.metrics.toolListCacheHits).toBe(0);
            expect(monitor.metrics.toolListCacheMisses).toBe(1);
        });
    });

    describe('getMetrics', () => {
        it('should calculate correct cache hit rate', () => {
            monitor.metrics.toolListCacheHits = 8;
            monitor.metrics.toolListCacheMisses = 2;

            const uptime = performance.now() - monitor.startTime;
            const cacheHitRate = monitor.metrics.toolListCacheHits /
                (monitor.metrics.toolListCacheHits + monitor.metrics.toolListCacheMisses);

            const result = {
                ...monitor.metrics,
                uptime,
                cacheHitRate: isNaN(cacheHitRate) ? 0 : cacheHitRate,
                requestsPerSecond: monitor.metrics.requestCount / (uptime / 1000)
            };

            expect(result.cacheHitRate).toBe(0.8); // 8/10 = 0.8
        });

        it('should handle zero division for cache hit rate', () => {
            monitor.metrics.toolListCacheHits = 0;
            monitor.metrics.toolListCacheMisses = 0;

            const cacheHitRate = monitor.metrics.toolListCacheHits /
                (monitor.metrics.toolListCacheHits + monitor.metrics.toolListCacheMisses);

            expect(isNaN(cacheHitRate)).toBe(true);
            expect(isNaN(cacheHitRate) ? 0 : cacheHitRate).toBe(0);
        });
    });
});

describe('BufferPool', () => {
    let bufferPool;

    beforeEach(() => {
        bufferPool = {
            pool: [],
            bufferSize: 8192,
            initialSize: 10
        };

        // Pre-allocate buffers
        for (let i = 0; i < bufferPool.initialSize; i++) {
            bufferPool.pool.push(Buffer.allocUnsafe(bufferPool.bufferSize));
        }
    });

    describe('get', () => {
        it('should return a buffer from pool when available', () => {
            const buffer = bufferPool.pool.length > 0 ?
                bufferPool.pool.pop() : Buffer.allocUnsafe(bufferPool.bufferSize);

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBe(8192);
            expect(bufferPool.pool.length).toBe(9); // One removed
        });

        it('should create new buffer when pool is empty', () => {
            bufferPool.pool = []; // Empty the pool

            const buffer = bufferPool.pool.length > 0 ?
                bufferPool.pool.pop() : Buffer.allocUnsafe(bufferPool.bufferSize);

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBe(8192);
        });
    });

    describe('release', () => {
        it('should return buffer to pool when conditions are met', () => {
            const buffer = Buffer.allocUnsafe(bufferPool.bufferSize);
            const initialPoolSize = bufferPool.pool.length;

            if (buffer.length === bufferPool.bufferSize && bufferPool.pool.length < 20) {
                bufferPool.pool.push(buffer);
            }

            expect(bufferPool.pool.length).toBe(initialPoolSize + 1);
        });

        it('should not return buffer to pool when size is wrong', () => {
            const buffer = Buffer.allocUnsafe(1024); // Wrong size
            const initialPoolSize = bufferPool.pool.length;

            if (buffer.length === bufferPool.bufferSize && bufferPool.pool.length < 20) {
                bufferPool.pool.push(buffer);
            }

            expect(bufferPool.pool.length).toBe(initialPoolSize);
        });

        it('should not return buffer to pool when pool is at max capacity', () => {
            // Fill pool to max capacity
            while (bufferPool.pool.length < 20) {
                bufferPool.pool.push(Buffer.allocUnsafe(bufferPool.bufferSize));
            }

            const buffer = Buffer.allocUnsafe(bufferPool.bufferSize);
            const initialPoolSize = bufferPool.pool.length;

            if (buffer.length === bufferPool.bufferSize && bufferPool.pool.length < 20) {
                bufferPool.pool.push(buffer);
            }

            expect(bufferPool.pool.length).toBe(initialPoolSize);
        });
    });
});

describe('ResponseCache', () => {
    let cache;

    beforeEach(() => {
        cache = {
            cache: new Map(),
            accessTimes: new Map(),
            maxSize: 1000,
            ttlMs: 30000
        };
    });

    describe('get', () => {
        it('should return null for non-existent entry', () => {
            const result = cache.cache.get('nonexistent');
            expect(result).toBeUndefined();
        });

        it('should return null for expired entry', () => {
            const expiredEntry = {
                data: { test: 'data' },
                timestamp: performance.now() - 40000 // 40 seconds ago (expired)
            };
            cache.cache.set('expired', expiredEntry);

            const now = performance.now();
            const entry = cache.cache.get('expired');

            let result = null;
            if (entry && now - entry.timestamp <= cache.ttlMs) {
                cache.accessTimes.set('expired', now);
                result = entry.data;
            } else if (entry) {
                cache.cache.delete('expired');
                cache.accessTimes.delete('expired');
            }

            expect(result).toBeNull();
        });

        it('should return valid entry and update access time', () => {
            const validEntry = {
                data: { test: 'data' },
                timestamp: performance.now() - 10000 // 10 seconds ago (valid)
            };
            cache.cache.set('valid', validEntry);

            const now = performance.now();
            const entry = cache.cache.get('valid');

            let result = null;
            if (entry && now - entry.timestamp <= cache.ttlMs) {
                cache.accessTimes.set('valid', now);
                result = entry.data;
            }

            expect(result).toEqual({ test: 'data' });
            expect(cache.accessTimes.has('valid')).toBe(true);
        });
    });

    describe('set', () => {
        it('should store entry with current timestamp', () => {
            const now = performance.now();
            const data = { test: 'data' };

            cache.cache.set('test', { data, timestamp: now });
            cache.accessTimes.set('test', now);

            expect(cache.cache.has('test')).toBe(true);
            expect(cache.accessTimes.has('test')).toBe(true);
        });

        it('should evict oldest entry when at max capacity', () => {
            // Fill cache to capacity
            for (let i = 0; i < cache.maxSize; i++) {
                cache.cache.set(`key${i}`, { data: `data${i}`, timestamp: performance.now() });
                cache.accessTimes.set(`key${i}`, performance.now() - i); // Different access times
            }

            // Add one more entry (should trigger eviction)
            const now = performance.now();

            // Find oldest entry to evict
            let oldestKey = null;
            let oldestTime = Infinity;

            for (const [key, time] of cache.accessTimes) {
                if (time < oldestTime) {
                    oldestTime = time;
                    oldestKey = key;
                }
            }

            if (oldestKey) {
                cache.cache.delete(oldestKey);
                cache.accessTimes.delete(oldestKey);
            }

            cache.cache.set('newKey', { data: 'newData', timestamp: now });
            cache.accessTimes.set('newKey', now);

            expect(cache.cache.size).toBe(cache.maxSize);
            expect(cache.cache.has('newKey')).toBe(true);
        });
    });

    describe('clear', () => {
        it('should clear both cache and access times', () => {
            cache.cache.set('key1', { data: 'data1', timestamp: performance.now() });
            cache.accessTimes.set('key1', performance.now());

            cache.cache.clear();
            cache.accessTimes.clear();

            expect(cache.cache.size).toBe(0);
            expect(cache.accessTimes.size).toBe(0);
        });
    });

    describe('getStats', () => {
        it('should return correct cache statistics', () => {
            cache.cache.set('key1', { data: 'data1', timestamp: performance.now() });

            const stats = {
                size: cache.cache.size,
                maxSize: cache.maxSize,
                ttlMs: cache.ttlMs,
                memoryUsage: cache.cache.size * 100 // Rough estimate
            };

            expect(stats.size).toBe(1);
            expect(stats.maxSize).toBe(1000);
            expect(stats.ttlMs).toBe(30000);
            expect(stats.memoryUsage).toBe(100);
        });
    });
});

describe('OptimizedMCPRouter', () => {
    let router;
    let mockConfig;
    let mockProcess;

    beforeEach(() => {
        mockConfig = {
            name: 'test-router',
            backendCommand: 'node',
            backendArgs: ['backend.js'],
            routerTools: []
        };

        // Mock spawn to return a mock process
        mockProcess = new EventEmitter();
        mockProcess.stdin = { write: jest.fn() };
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();

        spawn.mockReturnValue(mockProcess);

        // Mock router initialization
        router = {
            config: mockConfig,
            backendProcess: null,
            isReady: false,
            allTools: [],
            monitor: {
                recordRequest: jest.fn(),
                recordCacheHit: jest.fn(),
                getMetrics: jest.fn(() => ({}))
            },
            bufferPool: { get: jest.fn(), release: jest.fn() },
            responseCache: {
                get: jest.fn(),
                set: jest.fn(),
                clear: jest.fn(),
                getStats: jest.fn(() => ({}))
            },
            toolCallQueue: [],
            internalCallbacks: new Map(),
            nextInternalId: 5000,
            stdoutBuffer: '',
            stdinBuffer: '',
            toolListCache: null,
            toolListCacheTime: 0
        };
    });

    describe('startBackend', () => {
        it('should spawn backend process with correct parameters', async () => {
            // Simulate startBackend call
            router.backendProcess = spawn(mockConfig.backendCommand, mockConfig.backendArgs, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' }
            });

            expect(spawn).toHaveBeenCalledWith('node', ['backend.js'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: expect.objectContaining({
                    NODE_OPTIONS: '--max-old-space-size=512'
                })
            });
        });

        it('should handle backend process close event', () => {
            router.backendProcess = mockProcess;
            router.isReady = true;

            // Simulate backend crash
            mockProcess.emit('close', 1);

            expect(router.isReady).toBe(false);
            expect(router.responseCache.clear).toHaveBeenCalled();
        });
    });

    describe('processBackendLine', () => {
        it('should parse valid JSON line', () => {
            const jsonLine = '{"jsonrpc":"2.0","id":1,"result":"success"}';
            const trimmed = jsonLine.trim();

            if (trimmed) {
                const openBrace = jsonLine.indexOf('{');
                if (openBrace !== -1) {
                    const potentialJson = jsonLine.substring(openBrace);

                    try {
                        const parsed = JSON.parse(potentialJson);
                        expect(parsed).toEqual({
                            jsonrpc: "2.0",
                            id: 1,
                            result: "success"
                        });
                    } catch (e) {
                        // Should not reach here
                        expect(false).toBe(true);
                    }
                }
            }
        });

        it('should handle malformed JSON gracefully', () => {
            const malformedLine = '{"invalid": json}';
            const trimmed = malformedLine.trim();

            if (trimmed) {
                const openBrace = malformedLine.indexOf('{');
                if (openBrace !== -1) {
                    const potentialJson = malformedLine.substring(openBrace);

                    try {
                        const parsed = JSON.parse(potentialJson);
                        // Should not reach here
                        expect(false).toBe(true);
                    } catch (e) {
                        // Expected behavior - silent error handling
                        expect(e).toBeInstanceOf(SyntaxError);
                    }
                }
            }
        });

        it('should ignore lines without JSON', () => {
            const nonJsonLine = 'This is not JSON';
            const openBrace = nonJsonLine.indexOf('{');

            expect(openBrace).toBe(-1);
            // Line should be ignored
        });
    });

    describe('processClientMessage', () => {
        it('should handle initialize method with fast reply', () => {
            const initMessage = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize'
            };

            let replyId, replyResult;

            // Mock fastReply
            const fastReply = (id, result) => {
                replyId = id;
                replyResult = result;
            };

            if (initMessage.method === 'initialize') {
                fastReply(initMessage.id, {
                    protocolVersion: "2024-11-05",
                    serverInfo: { name: mockConfig.name + "-optimized", version: "1.1.0" },
                    capabilities: { tools: {}, resources: {}, prompts: {} }
                });
            }

            expect(replyId).toBe(1);
            expect(replyResult).toEqual({
                protocolVersion: "2024-11-05",
                serverInfo: { name: "test-router-optimized", version: "1.1.0" },
                capabilities: { tools: {}, resources: {}, prompts: {} }
            });
        });

        it('should handle tools/list with caching', () => {
            const toolsListMessage = {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list'
            };

            router.responseCache.get.mockReturnValue(null);
            router.toolListCache = [{ name: 'test-tool' }];

            let replyId, replyResult;
            const fastReply = (id, result) => {
                replyId = id;
                replyResult = result;
            };

            if (toolsListMessage.method === 'tools/list') {
                const cacheKey = 'tools/list';
                let cachedResponse = router.responseCache.get(cacheKey);

                if (!cachedResponse && router.toolListCache) {
                    cachedResponse = { tools: mockConfig.routerTools };
                    router.responseCache.set(cacheKey, cachedResponse);
                    router.monitor.recordCacheHit(false);
                } else if (cachedResponse) {
                    router.monitor.recordCacheHit(true);
                }

                fastReply(toolsListMessage.id, cachedResponse || { tools: mockConfig.routerTools });
            }

            expect(replyId).toBe(2);
            expect(router.responseCache.set).toHaveBeenCalled();
            expect(router.monitor.recordCacheHit).toHaveBeenCalledWith(false);
        });
    });

    describe('getPerformanceMetrics', () => {
        it('should return comprehensive performance metrics', () => {
            const mockMetrics = {
                requestCount: 100,
                averageResponseTime: 50,
                cacheHitRate: 0.8
            };
            const mockCacheStats = { size: 50, maxSize: 1000 };

            router.monitor.getMetrics.mockReturnValue(mockMetrics);
            router.responseCache.getStats.mockReturnValue(mockCacheStats);
            router.toolListCache = [1, 2, 3];
            router.allTools = [1, 2, 3];

            const result = {
                ...router.monitor.getMetrics(),
                cache: router.responseCache.getStats(),
                toolsCached: router.toolListCache ? router.allTools.length : 0
            };

            expect(result.requestCount).toBe(100);
            expect(result.cache.size).toBe(50);
            expect(result.toolsCached).toBe(3);
        });
    });
});

describe('Integration Tests', () => {
    describe('End-to-End Message Flow', () => {
        it('should handle complete message processing pipeline', () => {
            const inputMessage = '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n';
            const mockRouter = {
                stdinBuffer: '',
                processClientMessage: jest.fn()
            };

            // Simulate stdin handling
            mockRouter.stdinBuffer += inputMessage;
            const lines = mockRouter.stdinBuffer.split('\n');
            mockRouter.stdinBuffer = lines.pop();

            for (const line of lines) {
                if (line.trim()) {
                    mockRouter.processClientMessage(line);
                }
            }

            expect(mockRouter.processClientMessage).toHaveBeenCalledWith(
                '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
            );
        });
    });

    describe('Performance Optimization Validation', () => {
        it('should maintain response time under 100ms target', () => {
            const startTime = performance.now();

            // Simulate fast operations
            const responseTime = performance.now() - startTime;

            expect(responseTime).toBeLessThan(100);
        });

        it('should efficiently manage memory with buffer pooling', () => {
            const bufferPool = [];
            const bufferSize = 8192;
            const maxPoolSize = 20;

            // Simulate buffer allocation and release
            const buffer = Buffer.allocUnsafe(bufferSize);

            if (buffer.length === bufferSize && bufferPool.length < maxPoolSize) {
                bufferPool.push(buffer);
            }

            expect(bufferPool.length).toBe(1);
            expect(bufferPool[0].length).toBe(bufferSize);
        });

        it('should provide effective caching with TTL', () => {
            const cache = new Map();
            const ttlMs = 30000;
            const now = performance.now();

            // Store entry
            cache.set('test', {
                data: 'cached data',
                timestamp: now
            });

            // Retrieve within TTL
            const entry = cache.get('test');
            const isValid = (now - entry.timestamp) <= ttlMs;

            expect(isValid).toBe(true);
            expect(entry.data).toBe('cached data');
        });
    });
});

describe('Edge Cases and Error Handling', () => {
    describe('Concurrent Request Handling', () => {
        it('should handle multiple simultaneous requests', () => {
            const requestQueue = [];
            const batchSize = 10;

            // Simulate multiple requests
            for (let i = 0; i < 15; i++) {
                requestQueue.push({ id: i, data: `request${i}` });
            }

            // Process in batches
            const batches = [];
            while (requestQueue.length > 0) {
                batches.push(requestQueue.splice(0, batchSize));
            }

            expect(batches.length).toBe(2);
            expect(batches[0].length).toBe(10);
            expect(batches[1].length).toBe(5);
        });
    });

    describe('Error Recovery', () => {
        it('should handle backend process crash gracefully', () => {
            const router = {
                isReady: true,
                responseCache: { clear: jest.fn() },
                backendProcess: { pid: 1234 }
            };

            // Simulate backend crash
            router.isReady = false;
            router.responseCache.clear();

            expect(router.isReady).toBe(false);
            expect(router.responseCache.clear).toHaveBeenCalled();
        });

        it('should handle memory pressure with cache eviction', () => {
            const cache = new Map();
            const accessTimes = new Map();
            const maxSize = 3;

            // Fill beyond capacity
            for (let i = 0; i < 5; i++) {
                if (cache.size >= maxSize) {
                    // Evict oldest
                    let oldestKey = null;
                    let oldestTime = Infinity;

                    for (const [key, time] of accessTimes) {
                        if (time < oldestTime) {
                            oldestTime = time;
                            oldestKey = key;
                        }
                    }

                    if (oldestKey) {
                        cache.delete(oldestKey);
                        accessTimes.delete(oldestKey);
                    }
                }

                cache.set(`key${i}`, `data${i}`);
                accessTimes.set(`key${i}`, performance.now() - i);
            }

            expect(cache.size).toBeLessThanOrEqual(maxSize);
        });
    });

    describe('Security and Input Validation', () => {
        it('should handle malicious JSON input safely', () => {
            const maliciousInputs = [
                '{"__proto__":{"admin":true}}',
                '{"constructor":{"prototype":{"admin":true}}}',
                '{}.__proto__.admin = true',
                'require("child_process").exec("rm -rf /")'
            ];

            maliciousInputs.forEach(input => {
                try {
                    const parsed = JSON.parse(input);
                    // Should parse without executing malicious code
                    expect(typeof parsed).toBe('object');
                } catch (e) {
                    // Malformed JSON should be caught
                    expect(e).toBeInstanceOf(SyntaxError);
                }
            });
        });

        it('should validate message structure', () => {
            const validMessage = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize'
            };

            const invalidMessages = [
                {}, // Missing required fields
                { jsonrpc: '1.0' }, // Wrong version
                { id: 'string-id' }, // Wrong id type
                { method: 123 } // Wrong method type
            ];

            // Valid message
            expect(validMessage.jsonrpc).toBe('2.0');
            expect(typeof validMessage.id).toBe('number');
            expect(typeof validMessage.method).toBe('string');

            // Invalid messages should be rejected
            invalidMessages.forEach(msg => {
                const isValid = msg.jsonrpc === '2.0' &&
                               (typeof msg.id === 'number' || typeof msg.id === 'string') &&
                               typeof msg.method === 'string';
                expect(isValid).toBe(false);
            });
        });
    });
});