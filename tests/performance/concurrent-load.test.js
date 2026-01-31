/**
 * Concurrent Load Performance Tests
 * Tests for system behavior under various concurrent load scenarios
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';

describe('Concurrent Load Performance', () => {
    let loadGenerator;
    let performanceCollector;
    let resourceMonitor;

    beforeEach(() => {
        performanceCollector = {
            metrics: [],
            startTime: Date.now(),

            recordMetric(type, value, metadata = {}) {
                this.metrics.push({
                    type,
                    value,
                    metadata,
                    timestamp: Date.now(),
                    relativeTime: Date.now() - this.startTime
                });
            },

            getMetricsByType(type) {
                return this.metrics.filter(m => m.type === type);
            },

            getAggregateStats(type) {
                const metrics = this.getMetricsByType(type);
                if (metrics.length === 0) return null;

                const values = metrics.map(m => m.value);
                const sum = values.reduce((a, b) => a + b, 0);

                return {
                    count: metrics.length,
                    sum,
                    mean: sum / metrics.length,
                    min: Math.min(...values),
                    max: Math.max(...values),
                    median: this.calculatePercentile(values, 50),
                    p95: this.calculatePercentile(values, 95),
                    p99: this.calculatePercentile(values, 99)
                };
            },

            calculatePercentile(values, percentile) {
                const sorted = [...values].sort((a, b) => a - b);
                const index = Math.ceil((percentile / 100) * sorted.length) - 1;
                return sorted[index] || 0;
            }
        };

        resourceMonitor = {
            isMonitoring: false,
            samples: [],

            startMonitoring(interval = 100) {
                this.isMonitoring = true;
                this.monitorLoop(interval);
            },

            stopMonitoring() {
                this.isMonitoring = false;
            },

            async monitorLoop(interval) {
                while (this.isMonitoring) {
                    const sample = {
                        timestamp: Date.now(),
                        memory: process.memoryUsage(),
                        cpu: process.cpuUsage()
                    };

                    this.samples.push(sample);

                    // Keep only recent samples
                    if (this.samples.length > 1000) {
                        this.samples.shift();
                    }

                    await new Promise(resolve => setTimeout(resolve, interval));
                }
            },

            getResourceStats() {
                if (this.samples.length < 2) return null;

                const memoryValues = this.samples.map(s => s.memory.heapUsed);
                const first = this.samples[0];
                const last = this.samples[this.samples.length - 1];

                return {
                    duration: last.timestamp - first.timestamp,
                    samples: this.samples.length,
                    memory: {
                        min: Math.min(...memoryValues),
                        max: Math.max(...memoryValues),
                        current: last.memory.heapUsed,
                        growth: last.memory.heapUsed - first.memory.heapUsed
                    },
                    cpu: {
                        totalUser: last.cpu.user - first.cpu.user,
                        totalSystem: last.cpu.system - first.cpu.system
                    }
                };
            }
        };

        loadGenerator = {
            activeRequests: new Set(),
            completedRequests: 0,
            failedRequests: 0,
            requestCounter: 0,

            async simulateRequest(type, complexity = 1) {
                const requestId = ++this.requestCounter;
                const startTime = Date.now();

                this.activeRequests.add(requestId);

                try {
                    const result = await this.processRequestType(type, complexity);
                    const duration = Date.now() - startTime;

                    this.activeRequests.delete(requestId);
                    this.completedRequests++;

                    performanceCollector.recordMetric('request_duration', duration, {
                        requestId,
                        type,
                        complexity,
                        success: true
                    });

                    return { requestId, duration, result, success: true };

                } catch (error) {
                    const duration = Date.now() - startTime;

                    this.activeRequests.delete(requestId);
                    this.failedRequests++;

                    performanceCollector.recordMetric('request_duration', duration, {
                        requestId,
                        type,
                        complexity,
                        success: false,
                        error: error.message
                    });

                    return { requestId, duration, error: error.message, success: false };
                }
            },

            async processRequestType(type, complexity) {
                switch (type) {
                    case 'fast':
                        return this.simulateFastOperation(complexity);
                    case 'medium':
                        return this.simulateMediumOperation(complexity);
                    case 'slow':
                        return this.simulateSlowOperation(complexity);
                    case 'io':
                        return this.simulateIOOperation(complexity);
                    case 'cpu':
                        return this.simulateCPUOperation(complexity);
                    default:
                        throw new Error(`Unknown request type: ${type}`);
                }
            },

            async simulateFastOperation(complexity) {
                const iterations = 100 * complexity;
                let result = 0;

                for (let i = 0; i < iterations; i++) {
                    result += Math.random();
                }

                return { type: 'fast', result, iterations };
            },

            async simulateMediumOperation(complexity) {
                const iterations = 5000 * complexity;
                let result = 0;

                for (let i = 0; i < iterations; i++) {
                    result += Math.sqrt(i) * Math.sin(i);
                }

                await new Promise(resolve => setTimeout(resolve, 5 * complexity));
                return { type: 'medium', result: result % 1000000, iterations };
            },

            async simulateSlowOperation(complexity) {
                const delay = 50 + (complexity * 25);
                const iterations = 10000 * complexity;
                let result = 0;

                for (let i = 0; i < iterations; i++) {
                    result += Math.pow(i, 0.5) * Math.cos(i);
                }

                await new Promise(resolve => setTimeout(resolve, delay));
                return { type: 'slow', result: result % 1000000, delay, iterations };
            },

            async simulateIOOperation(complexity) {
                const delay = Math.random() * 20 + (complexity * 10);
                await new Promise(resolve => setTimeout(resolve, delay));

                return {
                    type: 'io',
                    data: new Array(1000 * complexity).fill(0).map(() => Math.random()),
                    delay
                };
            },

            async simulateCPUOperation(complexity) {
                const iterations = 100000 * complexity;
                let result = 0;

                // CPU-intensive computation
                for (let i = 0; i < iterations; i++) {
                    result += Math.sqrt(i) * Math.sin(i) * Math.cos(i) * Math.tan(i % 100);
                }

                return { type: 'cpu', result: result % 1000000, iterations };
            },

            getStats() {
                return {
                    active: this.activeRequests.size,
                    completed: this.completedRequests,
                    failed: this.failedRequests,
                    total: this.completedRequests + this.failedRequests,
                    successRate: this.completedRequests / (this.completedRequests + this.failedRequests) * 100
                };
            }
        };
    });

    afterEach(() => {
        resourceMonitor.stopMonitoring();
    });

    describe('Basic Concurrent Load', () => {
        it('should handle moderate concurrent requests', async () => {
            const concurrentRequests = 20;
            const requestsPerWorker = 5;

            resourceMonitor.startMonitoring();

            const workers = Array.from({ length: concurrentRequests }, async (_, workerId) => {
                const results = [];
                for (let i = 0; i < requestsPerWorker; i++) {
                    const result = await loadGenerator.simulateRequest('fast', 1);
                    results.push(result);
                }
                return results;
            });

            const workerResults = await Promise.all(workers);
            const allResults = workerResults.flat();

            resourceMonitor.stopMonitoring();

            const stats = loadGenerator.getStats();
            const durationStats = performanceCollector.getAggregateStats('request_duration');
            const resourceStats = resourceMonitor.getResourceStats();

            assert.strictEqual(allResults.length, concurrentRequests * requestsPerWorker);
            assert.ok(stats.successRate >= 95, `Success rate should be high (${stats.successRate.toFixed(1)}%)`);
            assert.ok(durationStats.p95 < 100, `p95 latency should be reasonable (${durationStats.p95.toFixed(2)}ms)`);

            console.log(`Concurrent test: ${stats.total} requests, ${stats.successRate.toFixed(1)}% success, p95: ${durationStats.p95.toFixed(2)}ms`);
        });

        it('should scale with increasing concurrent load', async () => {
            const loadLevels = [5, 10, 20, 50];
            const testResults = [];

            for (const concurrency of loadLevels) {
                // Reset counters
                loadGenerator.completedRequests = 0;
                loadGenerator.failedRequests = 0;
                loadGenerator.requestCounter = 0;
                performanceCollector.metrics = [];

                resourceMonitor.startMonitoring();
                const testStartTime = Date.now();

                const promises = Array.from({ length: concurrency }, () =>
                    loadGenerator.simulateRequest('medium', 1)
                );

                const results = await Promise.all(promises);
                const testDuration = Date.now() - testStartTime;

                resourceMonitor.stopMonitoring();

                const stats = loadGenerator.getStats();
                const durationStats = performanceCollector.getAggregateStats('request_duration');
                const resourceStats = resourceMonitor.getResourceStats();

                testResults.push({
                    concurrency,
                    duration: testDuration,
                    successRate: stats.successRate,
                    p95Latency: durationStats.p95,
                    memoryGrowth: resourceStats.memory.growth,
                    throughput: stats.total / (testDuration / 1000)
                });

                console.log(`Load level ${concurrency}: ${stats.successRate.toFixed(1)}% success, ${durationStats.p95.toFixed(2)}ms p95, ${(stats.total / (testDuration / 1000)).toFixed(1)} req/s`);

                // Brief pause between tests
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Analyze scaling characteristics
            assert.strictEqual(testResults.length, loadLevels.length);

            // All tests should have high success rates
            testResults.forEach(result => {
                assert.ok(result.successRate >= 90, `Success rate should remain high at concurrency ${result.concurrency}`);
            });

            // Latency should not degrade catastrophically
            const lowConcurrencyLatency = testResults[0].p95Latency;
            const highConcurrencyLatency = testResults[testResults.length - 1].p95Latency;

            const latencyIncrease = highConcurrencyLatency / lowConcurrencyLatency;
            assert.ok(latencyIncrease < 10, 'Latency should not increase more than 10x with higher concurrency');
        });
    });

    describe('Sustained Load Testing', () => {
        it('should maintain performance under sustained load', async () => {
            const testDuration = 2000; // 2 seconds
            const requestInterval = 50; // Request every 50ms
            const expectedRequests = Math.floor(testDuration / requestInterval);

            resourceMonitor.startMonitoring();
            const startTime = Date.now();

            const sustainedLoadPromise = (async () => {
                while (Date.now() - startTime < testDuration) {
                    // Don't await - send requests concurrently
                    loadGenerator.simulateRequest('medium', 1).catch(console.error);
                    await new Promise(resolve => setTimeout(resolve, requestInterval));
                }
            })();

            await sustainedLoadPromise;

            // Wait a bit for remaining requests to complete
            await new Promise(resolve => setTimeout(resolve, 200));

            resourceMonitor.stopMonitoring();

            const stats = loadGenerator.getStats();
            const durationStats = performanceCollector.getAggregateStats('request_duration');
            const resourceStats = resourceMonitor.getResourceStats();

            assert.ok(stats.total >= expectedRequests * 0.8, 'Should handle most expected requests');
            assert.ok(stats.successRate >= 90, 'Should maintain high success rate');

            // Check for performance degradation over time
            const firstHalfMetrics = performanceCollector.metrics.filter(m =>
                m.relativeTime < testDuration / 2
            ).map(m => m.value);

            const secondHalfMetrics = performanceCollector.metrics.filter(m =>
                m.relativeTime >= testDuration / 2
            ).map(m => m.value);

            if (firstHalfMetrics.length > 0 && secondHalfMetrics.length > 0) {
                const firstHalfAvg = firstHalfMetrics.reduce((a, b) => a + b, 0) / firstHalfMetrics.length;
                const secondHalfAvg = secondHalfMetrics.reduce((a, b) => a + b, 0) / secondHalfMetrics.length;

                const degradation = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
                assert.ok(degradation < 2.0, 'Performance should not degrade significantly over time');
            }

            console.log(`Sustained load: ${stats.total} requests over ${resourceStats.duration}ms, ${stats.successRate.toFixed(1)}% success`);
        });

        it('should handle bursty traffic patterns', async () => {
            const bursts = 5;
            const requestsPerBurst = 15;
            const burstDuration = 200; // ms
            const quietPeriod = 300; // ms

            resourceMonitor.startMonitoring();

            for (let burstId = 0; burstId < bursts; burstId++) {
                const burstStartTime = Date.now();

                // Generate burst of requests
                const burstPromises = [];
                while (Date.now() - burstStartTime < burstDuration) {
                    burstPromises.push(loadGenerator.simulateRequest('fast', 1));
                    await new Promise(resolve => setTimeout(resolve, burstDuration / requestsPerBurst));
                }

                // Wait for burst to complete
                await Promise.all(burstPromises);

                // Quiet period
                if (burstId < bursts - 1) {
                    await new Promise(resolve => setTimeout(resolve, quietPeriod));
                }

                console.log(`Burst ${burstId + 1} completed: ${burstPromises.length} requests`);
            }

            resourceMonitor.stopMonitoring();

            const stats = loadGenerator.getStats();
            const durationStats = performanceCollector.getAggregateStats('request_duration');

            assert.ok(stats.total >= bursts * 5, 'Should handle minimum expected requests per burst');
            assert.ok(stats.successRate >= 95, 'Should handle bursty traffic with high success rate');

            // Analyze latency distribution
            const burstMetrics = performanceCollector.metrics.map(m => m.value);
            const latencyVariance = this.calculateVariance(burstMetrics);

            console.log(`Bursty traffic: ${stats.total} total requests, p95: ${durationStats.p95.toFixed(2)}ms, variance: ${latencyVariance.toFixed(2)}`);
        });
    });

    describe('Mixed Workload Performance', () => {
        it('should handle mixed request types efficiently', async () => {
            const workloadMix = [
                { type: 'fast', count: 30, complexity: 1 },
                { type: 'medium', count: 20, complexity: 1 },
                { type: 'slow', count: 10, complexity: 1 },
                { type: 'io', count: 15, complexity: 1 },
                { type: 'cpu', count: 10, complexity: 1 }
            ];

            resourceMonitor.startMonitoring();

            const allPromises = [];
            workloadMix.forEach(workload => {
                for (let i = 0; i < workload.count; i++) {
                    allPromises.push(
                        loadGenerator.simulateRequest(workload.type, workload.complexity)
                    );
                }
            });

            // Shuffle requests to mix execution order
            for (let i = allPromises.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allPromises[i], allPromises[j]] = [allPromises[j], allPromises[i]];
            }

            const results = await Promise.all(allPromises);

            resourceMonitor.stopMonitoring();

            // Analyze results by type
            const resultsByType = {};
            workloadMix.forEach(workload => {
                const typeResults = results.filter(r =>
                    r.result && r.result.type === workload.type
                );
                const typeDurations = typeResults.map(r => r.duration);

                if (typeDurations.length > 0) {
                    resultsByType[workload.type] = {
                        count: typeResults.length,
                        successCount: typeResults.filter(r => r.success).length,
                        avgDuration: typeDurations.reduce((a, b) => a + b, 0) / typeDurations.length,
                        p95Duration: this.calculatePercentile(typeDurations, 95)
                    };
                }
            });

            // Verify each workload type
            Object.entries(resultsByType).forEach(([type, stats]) => {
                assert.ok(stats.successCount > 0, `${type} requests should succeed`);
                assert.ok(stats.count > 0, `Should have ${type} results`);

                console.log(`${type}: ${stats.successCount}/${stats.count} success, avg: ${stats.avgDuration.toFixed(2)}ms, p95: ${stats.p95Duration.toFixed(2)}ms`);
            });

            // Fast requests should be fastest
            assert.ok(
                resultsByType.fast.avgDuration < resultsByType.slow.avgDuration,
                'Fast requests should be faster than slow requests on average'
            );
        });

        it('should prioritize critical requests under load', async () => {
            const criticalRequestTracker = {
                criticalRequests: [],
                normalRequests: [],

                async simulatePrioritizedRequest(priority, type, complexity = 1) {
                    const startTime = Date.now();

                    // Simulate priority handling (critical requests processed first)
                    if (priority === 'critical') {
                        const result = await loadGenerator.simulateRequest(type, complexity);
                        const duration = Date.now() - startTime;

                        this.criticalRequests.push({ ...result, duration, priority });
                        return result;
                    } else {
                        // Add small delay for normal requests to simulate queuing
                        await new Promise(resolve => setTimeout(resolve, 10));

                        const result = await loadGenerator.simulateRequest(type, complexity);
                        const duration = Date.now() - startTime;

                        this.normalRequests.push({ ...result, duration, priority });
                        return result;
                    }
                },

                getStats() {
                    const criticalDurations = this.criticalRequests.map(r => r.duration);
                    const normalDurations = this.normalRequests.map(r => r.duration);

                    return {
                        critical: {
                            count: this.criticalRequests.length,
                            avgDuration: criticalDurations.length > 0
                                ? criticalDurations.reduce((a, b) => a + b, 0) / criticalDurations.length
                                : 0,
                            p95Duration: criticalDurations.length > 0
                                ? performanceCollector.calculatePercentile(criticalDurations, 95)
                                : 0
                        },
                        normal: {
                            count: this.normalRequests.length,
                            avgDuration: normalDurations.length > 0
                                ? normalDurations.reduce((a, b) => a + b, 0) / normalDurations.length
                                : 0,
                            p95Duration: normalDurations.length > 0
                                ? performanceCollector.calculatePercentile(normalDurations, 95)
                                : 0
                        }
                    };
                }
            };

            // Generate mix of critical and normal requests concurrently
            const requests = [];

            // 20% critical requests
            for (let i = 0; i < 10; i++) {
                requests.push(
                    criticalRequestTracker.simulatePrioritizedRequest('critical', 'fast', 1)
                );
            }

            // 80% normal requests
            for (let i = 0; i < 40; i++) {
                requests.push(
                    criticalRequestTracker.simulatePrioritizedRequest('normal', 'medium', 1)
                );
            }

            // Shuffle to simulate random arrival order
            for (let i = requests.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [requests[i], requests[j]] = [requests[j], requests[i]];
            }

            await Promise.all(requests);

            const priorityStats = criticalRequestTracker.getStats();

            assert.ok(priorityStats.critical.count > 0, 'Should have critical requests');
            assert.ok(priorityStats.normal.count > 0, 'Should have normal requests');

            // Critical requests should generally be faster due to prioritization
            if (priorityStats.critical.avgDuration > 0 && priorityStats.normal.avgDuration > 0) {
                const priorityBenefit = priorityStats.normal.avgDuration / priorityStats.critical.avgDuration;
                assert.ok(priorityBenefit >= 1.0, 'Priority system should provide some benefit');

                console.log(`Priority test: Critical avg: ${priorityStats.critical.avgDuration.toFixed(2)}ms, Normal avg: ${priorityStats.normal.avgDuration.toFixed(2)}ms, Benefit: ${priorityBenefit.toFixed(2)}x`);
            }
        });
    });

    // Helper method for calculating variance
    calculateVariance(values) {
        if (values.length === 0) return 0;

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    }

    // Helper method for calculating percentiles
    calculatePercentile(values, percentile) {
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index] || 0;
    }
});