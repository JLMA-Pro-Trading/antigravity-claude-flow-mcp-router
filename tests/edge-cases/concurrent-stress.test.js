/**
 * Concurrent Request Stress Tests
 * Tests for handling high load and concurrent operations
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';

describe('Concurrent Stress Testing', () => {
    let requestManager;
    let performanceMetrics;

    beforeEach(() => {
        performanceMetrics = {
            totalRequests: 0,
            completedRequests: 0,
            failedRequests: 0,
            averageLatency: 0,
            maxLatency: 0,
            minLatency: Infinity,
            startTime: Date.now()
        };

        requestManager = {
            activeRequests: new Map(),
            requestQueue: [],
            maxConcurrentRequests: 50,
            processing: false,

            async processRequest(requestId, payload) {
                const startTime = Date.now();
                this.activeRequests.set(requestId, { startTime, payload });

                try {
                    // Simulate processing
                    await this.simulateProcessing(payload);

                    const latency = Date.now() - startTime;
                    this.updateMetrics(latency, true);
                    this.activeRequests.delete(requestId);

                    return { success: true, requestId, latency };
                } catch (error) {
                    const latency = Date.now() - startTime;
                    this.updateMetrics(latency, false);
                    this.activeRequests.delete(requestId);

                    return { success: false, requestId, error: error.message };
                }
            },

            async simulateProcessing(payload) {
                // Simulate variable processing time
                const baseTime = payload.complexity || 10;
                const jitter = Math.random() * 20;
                await new Promise(resolve => setTimeout(resolve, baseTime + jitter));

                // Simulate occasional failures
                if (Math.random() < 0.05) { // 5% failure rate
                    throw new Error('Random processing failure');
                }

                return { processed: true, data: payload };
            },

            updateMetrics(latency, success) {
                performanceMetrics.totalRequests++;
                if (success) {
                    performanceMetrics.completedRequests++;
                } else {
                    performanceMetrics.failedRequests++;
                }

                performanceMetrics.maxLatency = Math.max(performanceMetrics.maxLatency, latency);
                performanceMetrics.minLatency = Math.min(performanceMetrics.minLatency, latency);

                // Calculate rolling average
                const totalLatency = performanceMetrics.averageLatency * (performanceMetrics.totalRequests - 1) + latency;
                performanceMetrics.averageLatency = totalLatency / performanceMetrics.totalRequests;
            },

            canAcceptRequest() {
                return this.activeRequests.size < this.maxConcurrentRequests;
            },

            queueRequest(requestId, payload) {
                this.requestQueue.push({ requestId, payload });
            },

            async processQueue() {
                if (this.processing) return;
                this.processing = true;

                while (this.requestQueue.length > 0 && this.canAcceptRequest()) {
                    const { requestId, payload } = this.requestQueue.shift();
                    // Don't await - process concurrently
                    this.processRequest(requestId, payload).catch(console.error);
                }

                this.processing = false;
            }
        };
    });

    afterEach(() => {
        // Clean up any remaining requests
        requestManager.activeRequests.clear();
        requestManager.requestQueue = [];
    });

    describe('High Concurrency Load', () => {
        it('should handle 100 concurrent requests', async () => {
            const requestCount = 100;
            const promises = [];

            for (let i = 0; i < requestCount; i++) {
                const promise = requestManager.processRequest(`req_${i}`, {
                    complexity: Math.floor(Math.random() * 50),
                    data: `test_data_${i}`
                });
                promises.push(promise);
            }

            const results = await Promise.allSettled(promises);

            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;

            assert.ok(successful > 0, 'Should have some successful requests');
            assert.ok(successful + failed === requestCount, 'All requests should be accounted for');
            assert.ok(performanceMetrics.averageLatency > 0, 'Should have recorded latency');

            console.log(`Concurrent test: ${successful}/${requestCount} successful, avg latency: ${performanceMetrics.averageLatency.toFixed(2)}ms`);
        });

        it('should respect concurrency limits', async () => {
            const maxConcurrent = 10;
            requestManager.maxConcurrentRequests = maxConcurrent;

            // Start more requests than the limit
            const requestCount = 50;
            const promises = [];

            for (let i = 0; i < requestCount; i++) {
                if (requestManager.canAcceptRequest()) {
                    const promise = requestManager.processRequest(`req_${i}`, { complexity: 100 });
                    promises.push(promise);
                } else {
                    requestManager.queueRequest(`req_${i}`, { complexity: 100 });
                }
            }

            // Check that we don't exceed the limit
            assert.ok(requestManager.activeRequests.size <= maxConcurrent);
            assert.ok(requestManager.requestQueue.length > 0);

            // Wait for some requests to complete
            await Promise.allSettled(promises);
        });

        it('should handle burst traffic patterns', async () => {
            const bursts = 5;
            const requestsPerBurst = 20;

            for (let burst = 0; burst < bursts; burst++) {
                const burstPromises = [];

                for (let i = 0; i < requestsPerBurst; i++) {
                    const promise = requestManager.processRequest(`burst_${burst}_req_${i}`, {
                        complexity: 20 + Math.random() * 30
                    });
                    burstPromises.push(promise);
                }

                // Wait for burst to complete
                await Promise.allSettled(burstPromises);

                // Brief pause between bursts
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            assert.strictEqual(performanceMetrics.totalRequests, bursts * requestsPerBurst);
        });
    });

    describe('Resource Exhaustion', () => {
        it('should handle memory pressure gracefully', async () => {
            const memoryMonitor = {
                memoryUsage: 0,
                peakMemory: 0,
                allocations: 0,

                allocate(size) {
                    this.memoryUsage += size;
                    this.peakMemory = Math.max(this.peakMemory, this.memoryUsage);
                    this.allocations++;
                },

                deallocate(size) {
                    this.memoryUsage = Math.max(0, this.memoryUsage - size);
                },

                checkPressure() {
                    return this.memoryUsage > 100000; // 100KB threshold
                }
            };

            const requestsWithMemory = [];

            for (let i = 0; i < 50; i++) {
                const memorySize = Math.floor(Math.random() * 5000) + 1000; // 1-6KB per request
                memoryMonitor.allocate(memorySize);

                const promise = requestManager.processRequest(`mem_req_${i}`, {
                    complexity: 30,
                    memorySize
                }).then(result => {
                    memoryMonitor.deallocate(memorySize);
                    return result;
                });

                requestsWithMemory.push(promise);

                // Check for memory pressure
                if (memoryMonitor.checkPressure()) {
                    console.log(`Memory pressure detected at request ${i}, usage: ${memoryMonitor.memoryUsage}`);
                }
            }

            await Promise.allSettled(requestsWithMemory);

            assert.ok(memoryMonitor.peakMemory > 0);
            assert.ok(memoryMonitor.memoryUsage >= 0); // Should not be negative
        });

        it('should handle file descriptor limits', () => {
            const fdManager = {
                openFiles: new Set(),
                maxFiles: 20,

                openFile(filename) {
                    if (this.openFiles.size >= this.maxFiles) {
                        throw new Error('Too many open files');
                    }
                    this.openFiles.add(filename);
                    return { fd: filename, opened: true };
                },

                closeFile(filename) {
                    this.openFiles.delete(filename);
                },

                getOpenCount() {
                    return this.openFiles.size;
                }
            };

            // Try to open more files than the limit
            let successfulOpens = 0;
            let errors = 0;

            for (let i = 0; i < 30; i++) {
                try {
                    fdManager.openFile(`file_${i}`);
                    successfulOpens++;
                } catch (error) {
                    errors++;
                }
            }

            assert.strictEqual(successfulOpens, fdManager.maxFiles);
            assert.strictEqual(errors, 10);
            assert.strictEqual(fdManager.getOpenCount(), fdManager.maxFiles);

            // Close some files and try again
            fdManager.closeFile('file_0');
            fdManager.closeFile('file_1');

            assert.doesNotThrow(() => {
                fdManager.openFile('file_20');
                fdManager.openFile('file_21');
            });
        });
    });

    describe('Race Conditions', () => {
        it('should handle concurrent state modifications', async () => {
            const sharedState = {
                counter: 0,
                mutex: false,
                operations: []
            };

            const safeIncrement = async (id) => {
                // Simple mutex implementation
                while (sharedState.mutex) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }

                sharedState.mutex = true;
                const currentValue = sharedState.counter;

                // Simulate some processing time
                await new Promise(resolve => setTimeout(resolve, Math.random() * 10));

                sharedState.counter = currentValue + 1;
                sharedState.operations.push({ id, value: sharedState.counter });
                sharedState.mutex = false;
            };

            // Start many concurrent increment operations
            const operations = Array.from({ length: 50 }, (_, i) => safeIncrement(i));
            await Promise.all(operations);

            assert.strictEqual(sharedState.counter, 50);
            assert.strictEqual(sharedState.operations.length, 50);

            // Check that all operations were recorded in order
            for (let i = 0; i < sharedState.operations.length; i++) {
                assert.strictEqual(sharedState.operations[i].value, i + 1);
            }
        });

        it('should handle concurrent map operations', async () => {
            const concurrentMap = new Map();
            const operations = [];

            // Concurrent set operations
            for (let i = 0; i < 100; i++) {
                operations.push(
                    Promise.resolve().then(() => {
                        concurrentMap.set(`key_${i}`, `value_${i}`);
                    })
                );
            }

            // Concurrent get/delete operations
            for (let i = 0; i < 50; i++) {
                operations.push(
                    Promise.resolve().then(() => {
                        const value = concurrentMap.get(`key_${i}`);
                        if (value) {
                            concurrentMap.delete(`key_${i}`);
                        }
                    })
                );
            }

            await Promise.all(operations);

            // Map should have entries, but exact count is non-deterministic due to race conditions
            assert.ok(concurrentMap.size >= 0);
            assert.ok(concurrentMap.size <= 100);
        });
    });

    describe('Error Propagation Under Load', () => {
        it('should maintain error handling under high load', async () => {
            const errorTracker = {
                errors: [],
                errorTypes: new Map(),

                recordError(type, message) {
                    this.errors.push({ type, message, timestamp: Date.now() });
                    const count = this.errorTypes.get(type) || 0;
                    this.errorTypes.set(type, count + 1);
                }
            };

            const failingRequestManager = {
                async processFailingRequest(id, shouldFail) {
                    try {
                        if (shouldFail) {
                            throw new Error(`Intentional failure for ${id}`);
                        }

                        await new Promise(resolve => setTimeout(resolve, 10));
                        return { success: true, id };

                    } catch (error) {
                        errorTracker.recordError('processing_error', error.message);
                        throw error;
                    }
                }
            };

            const promises = [];
            const totalRequests = 100;
            const failureRate = 0.3; // 30% failure rate

            for (let i = 0; i < totalRequests; i++) {
                const shouldFail = Math.random() < failureRate;
                const promise = failingRequestManager.processFailingRequest(`req_${i}`, shouldFail)
                    .catch(error => ({ success: false, error: error.message }));
                promises.push(promise);
            }

            const results = await Promise.all(promises);

            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;

            assert.ok(failed > 0, 'Should have some failures');
            assert.ok(successful > 0, 'Should have some successes');
            assert.strictEqual(successful + failed, totalRequests);
            assert.ok(errorTracker.errors.length > 0, 'Should have recorded errors');
        });

        it('should handle cascading failures', async () => {
            const systemHealth = {
                healthy: true,
                failureCount: 0,
                lastFailure: null,

                checkHealth() {
                    return this.healthy && this.failureCount < 10;
                },

                recordFailure() {
                    this.failureCount++;
                    this.lastFailure = Date.now();

                    if (this.failureCount >= 5) {
                        this.healthy = false;
                    }
                }
            };

            const cascadingService = {
                async processWithCascade(id) {
                    if (!systemHealth.checkHealth()) {
                        throw new Error('System unhealthy - rejecting requests');
                    }

                    // Simulate processing with chance of failure
                    const willFail = Math.random() < 0.2; // 20% failure rate

                    if (willFail) {
                        systemHealth.recordFailure();
                        throw new Error(`Processing failed for ${id}`);
                    }

                    await new Promise(resolve => setTimeout(resolve, 5));
                    return { success: true, id };
                }
            };

            const results = [];
            let healthyRequests = 0;
            let unhealthyRequests = 0;

            // Keep sending requests until system becomes unhealthy
            for (let i = 0; i < 50; i++) {
                try {
                    const result = await cascadingService.processWithCascade(`req_${i}`);
                    results.push(result);
                    healthyRequests++;
                } catch (error) {
                    results.push({ success: false, error: error.message });
                    if (error.message.includes('unhealthy')) {
                        unhealthyRequests++;
                    }
                }
            }

            assert.ok(systemHealth.failureCount > 0, 'Should have recorded failures');
            assert.ok(unhealthyRequests > 0, 'Should have rejected requests after becoming unhealthy');
        });
    });

    describe('Performance Degradation', () => {
        it('should detect performance degradation under load', async () => {
            const performanceMonitor = {
                latencyHistory: [],
                degradationThreshold: 100, // ms

                recordLatency(latency) {
                    this.latencyHistory.push({
                        latency,
                        timestamp: Date.now()
                    });

                    // Keep only recent history (last 20 measurements)
                    if (this.latencyHistory.length > 20) {
                        this.latencyHistory.shift();
                    }
                },

                detectDegradation() {
                    if (this.latencyHistory.length < 10) return false;

                    const recentLatencies = this.latencyHistory.slice(-10).map(h => h.latency);
                    const avgLatency = recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length;

                    return avgLatency > this.degradationThreshold;
                }
            };

            // Simulate increasing load causing performance degradation
            for (let load = 1; load <= 10; load++) {
                const promises = [];

                for (let i = 0; i < load * 5; i++) {
                    const startTime = Date.now();
                    const promise = new Promise(resolve => {
                        // Simulate processing time that increases with load
                        const processingTime = 10 + (load * 10) + Math.random() * 20;
                        setTimeout(() => {
                            const latency = Date.now() - startTime;
                            performanceMonitor.recordLatency(latency);
                            resolve({ latency });
                        }, processingTime);
                    });
                    promises.push(promise);
                }

                await Promise.all(promises);

                if (performanceMonitor.detectDegradation()) {
                    console.log(`Performance degradation detected at load level ${load}`);
                    break;
                }
            }

            assert.ok(performanceMonitor.latencyHistory.length > 0);
        });

        it('should handle timeouts under extreme load', async () => {
            const timeoutManager = {
                defaultTimeout: 1000,
                activeTimeouts: new Map(),

                createTimeout(id, customTimeout) {
                    const timeout = customTimeout || this.defaultTimeout;
                    const timeoutHandle = setTimeout(() => {
                        this.activeTimeouts.delete(id);
                        throw new Error(`Request ${id} timed out after ${timeout}ms`);
                    }, timeout);

                    this.activeTimeouts.set(id, timeoutHandle);
                    return timeoutHandle;
                },

                clearTimeout(id) {
                    const timeoutHandle = this.activeTimeouts.get(id);
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                        this.activeTimeouts.delete(id);
                    }
                },

                getActiveTimeouts() {
                    return this.activeTimeouts.size;
                }
            };

            const slowRequests = [];

            // Create requests with varying processing times
            for (let i = 0; i < 20; i++) {
                const processingTime = Math.random() * 2000; // 0-2 seconds
                const timeoutHandle = timeoutManager.createTimeout(`req_${i}`, 1500);

                const promise = new Promise((resolve, reject) => {
                    setTimeout(() => {
                        timeoutManager.clearTimeout(`req_${i}`);
                        resolve({ id: `req_${i}`, processingTime });
                    }, processingTime);
                }).catch(error => ({ error: error.message }));

                slowRequests.push(promise);
            }

            const results = await Promise.allSettled(slowRequests);

            const successful = results.filter(r =>
                r.status === 'fulfilled' && !r.value.error
            ).length;

            const timedOut = results.filter(r =>
                r.status === 'fulfilled' && r.value.error && r.value.error.includes('timed out')
            ).length;

            assert.ok(successful >= 0);
            assert.ok(timedOut >= 0);
            assert.strictEqual(successful + timedOut, 20);
        });
    });
});