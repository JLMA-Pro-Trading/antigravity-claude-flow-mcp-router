/**
 * Response Time Performance Tests
 * Tests for measuring and validating response time benchmarks
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('Response Time Performance', () => {
    let performanceMonitor;
    let requestProcessor;

    beforeEach(() => {
        performanceMonitor = {
            measurements: [],
            thresholds: {
                p50: 50,    // 50ms
                p95: 200,   // 200ms
                p99: 500    // 500ms
            },

            measureOperation: async function(operation, metadata = {}) {
                const startTime = process.hrtime.bigint();
                const startCpu = process.cpuUsage();

                try {
                    const result = await operation();
                    const endTime = process.hrtime.bigint();
                    const endCpu = process.cpuUsage(startCpu);

                    const measurement = {
                        duration: Number(endTime - startTime) / 1000000, // Convert to milliseconds
                        cpuUsage: {
                            user: endCpu.user,
                            system: endCpu.system
                        },
                        timestamp: Date.now(),
                        success: true,
                        metadata,
                        result
                    };

                    this.measurements.push(measurement);
                    return measurement;

                } catch (error) {
                    const endTime = process.hrtime.bigint();
                    const endCpu = process.cpuUsage(startCpu);

                    const measurement = {
                        duration: Number(endTime - startTime) / 1000000,
                        cpuUsage: {
                            user: endCpu.user,
                            system: endCpu.system
                        },
                        timestamp: Date.now(),
                        success: false,
                        error: error.message,
                        metadata
                    };

                    this.measurements.push(measurement);
                    throw error;
                }
            },

            getPercentile: function(percentile) {
                const successful = this.measurements.filter(m => m.success);
                if (successful.length === 0) return null;

                const sorted = successful.map(m => m.duration).sort((a, b) => a - b);
                const index = Math.ceil((percentile / 100) * sorted.length) - 1;
                return sorted[index];
            },

            getStats: function() {
                const successful = this.measurements.filter(m => m.success);
                const failed = this.measurements.filter(m => !m.success);

                if (successful.length === 0) {
                    return { error: 'No successful measurements' };
                }

                const durations = successful.map(m => m.duration);
                const sum = durations.reduce((a, b) => a + b, 0);

                return {
                    count: this.measurements.length,
                    successful: successful.length,
                    failed: failed.length,
                    mean: sum / successful.length,
                    min: Math.min(...durations),
                    max: Math.max(...durations),
                    p50: this.getPercentile(50),
                    p95: this.getPercentile(95),
                    p99: this.getPercentile(99)
                };
            },

            checkThresholds: function() {
                const stats = this.getStats();
                if (stats.error) return stats;

                return {
                    p50: {
                        value: stats.p50,
                        threshold: this.thresholds.p50,
                        passed: stats.p50 <= this.thresholds.p50
                    },
                    p95: {
                        value: stats.p95,
                        threshold: this.thresholds.p95,
                        passed: stats.p95 <= this.thresholds.p95
                    },
                    p99: {
                        value: stats.p99,
                        threshold: this.thresholds.p99,
                        passed: stats.p99 <= this.thresholds.p99
                    }
                };
            }
        };

        requestProcessor = {
            processRequest: async function(requestType, complexity = 1) {
                // Simulate different types of processing
                switch (requestType) {
                    case 'simple':
                        await this.simulateSimpleOperation();
                        break;
                    case 'moderate':
                        await this.simulateModerateOperation(complexity);
                        break;
                    case 'complex':
                        await this.simulateComplexOperation(complexity);
                        break;
                    case 'io_bound':
                        await this.simulateIOOperation();
                        break;
                    case 'cpu_bound':
                        await this.simulateCPUOperation(complexity);
                        break;
                    default:
                        throw new Error(`Unknown request type: ${requestType}`);
                }

                return {
                    type: requestType,
                    complexity,
                    processed: true,
                    timestamp: Date.now()
                };
            },

            simulateSimpleOperation: async function() {
                // Minimal processing - just validate input
                const data = { id: Math.random(), timestamp: Date.now() };
                return data;
            },

            simulateModerateOperation: async function(complexity) {
                // Moderate processing with some computation
                let result = 0;
                for (let i = 0; i < complexity * 1000; i++) {
                    result += Math.sqrt(i);
                }

                // Small async operation
                await new Promise(resolve => setTimeout(resolve, 1));
                return result;
            },

            simulateComplexOperation: async function(complexity) {
                // Complex processing with multiple phases
                const phases = [];

                // Phase 1: Data processing
                for (let i = 0; i < complexity * 5000; i++) {
                    phases.push(Math.sin(i) * Math.cos(i));
                }

                // Phase 2: Async operation
                await new Promise(resolve => setTimeout(resolve, complexity * 10));

                // Phase 3: Data aggregation
                const sum = phases.reduce((a, b) => a + b, 0);
                return { phases: phases.length, sum };
            },

            simulateIOOperation: async function() {
                // Simulate I/O bound operation (file read, database query, etc.)
                const ioDelay = Math.random() * 50 + 10; // 10-60ms
                await new Promise(resolve => setTimeout(resolve, ioDelay));

                return {
                    type: 'io_result',
                    data: new Array(1000).fill(0).map(() => Math.random())
                };
            },

            simulateCPUOperation: function(complexity) {
                // Simulate CPU-intensive operation
                let result = 0;
                const iterations = complexity * 50000;

                for (let i = 0; i < iterations; i++) {
                    result += Math.sqrt(i) * Math.sin(i);
                }

                return Promise.resolve({
                    type: 'cpu_result',
                    iterations,
                    result: result % 1000000
                });
            }
        };
    });

    afterEach(() => {
        // Clear measurements
        performanceMonitor.measurements = [];
    });

    describe('Basic Response Time Benchmarks', () => {
        it('should handle simple requests under 50ms (p95)', async () => {
            const requestCount = 100;

            for (let i = 0; i < requestCount; i++) {
                await performanceMonitor.measureOperation(
                    () => requestProcessor.processRequest('simple'),
                    { requestId: i, type: 'simple' }
                );
            }

            const stats = performanceMonitor.getStats();

            assert.strictEqual(stats.successful, requestCount);
            assert.strictEqual(stats.failed, 0);
            assert.ok(stats.p95 < 50, `p95 (${stats.p95.toFixed(2)}ms) should be under 50ms for simple requests`);
            assert.ok(stats.mean < 25, `Mean (${stats.mean.toFixed(2)}ms) should be under 25ms for simple requests`);

            console.log(`Simple requests - Mean: ${stats.mean.toFixed(2)}ms, p95: ${stats.p95.toFixed(2)}ms, p99: ${stats.p99.toFixed(2)}ms`);
        });

        it('should handle moderate complexity requests efficiently', async () => {
            const requestCount = 50;
            const complexity = 2;

            for (let i = 0; i < requestCount; i++) {
                await performanceMonitor.measureOperation(
                    () => requestProcessor.processRequest('moderate', complexity),
                    { requestId: i, type: 'moderate', complexity }
                );
            }

            const stats = performanceMonitor.getStats();

            assert.strictEqual(stats.successful, requestCount);
            assert.ok(stats.p95 < 100, `p95 (${stats.p95.toFixed(2)}ms) should be under 100ms for moderate requests`);

            console.log(`Moderate requests - Mean: ${stats.mean.toFixed(2)}ms, p95: ${stats.p95.toFixed(2)}ms`);
        });

        it('should handle complex requests within reasonable bounds', async () => {
            const requestCount = 20;
            const complexity = 1;

            for (let i = 0; i < requestCount; i++) {
                await performanceMonitor.measureOperation(
                    () => requestProcessor.processRequest('complex', complexity),
                    { requestId: i, type: 'complex', complexity }
                );
            }

            const stats = performanceMonitor.getStats();

            assert.strictEqual(stats.successful, requestCount);
            assert.ok(stats.p95 < 500, `p95 (${stats.p95.toFixed(2)}ms) should be under 500ms for complex requests`);

            console.log(`Complex requests - Mean: ${stats.mean.toFixed(2)}ms, p95: ${stats.p95.toFixed(2)}ms`);
        });
    });

    describe('Load-Based Performance', () => {
        it('should maintain performance under concurrent load', async () => {
            const concurrentRequests = 20;
            const requestsPerWorker = 10;

            const workers = Array.from({ length: concurrentRequests }, async (_, workerId) => {
                for (let i = 0; i < requestsPerWorker; i++) {
                    await performanceMonitor.measureOperation(
                        () => requestProcessor.processRequest('simple'),
                        { workerId, requestId: i, type: 'concurrent_simple' }
                    );
                }
            });

            await Promise.all(workers);

            const stats = performanceMonitor.getStats();
            const totalRequests = concurrentRequests * requestsPerWorker;

            assert.strictEqual(stats.successful, totalRequests);
            assert.ok(stats.p95 < 100, `p95 (${stats.p95.toFixed(2)}ms) should remain under 100ms under concurrent load`);

            console.log(`Concurrent load - Total: ${totalRequests}, Mean: ${stats.mean.toFixed(2)}ms, p95: ${stats.p95.toFixed(2)}ms`);
        });

        it('should handle burst traffic patterns', async () => {
            const bursts = 5;
            const requestsPerBurst = 20;
            const burstInterval = 100; // ms between bursts

            for (let burstId = 0; burstId < bursts; burstId++) {
                // Create burst of concurrent requests
                const burstPromises = Array.from({ length: requestsPerBurst }, async (_, requestId) => {
                    return performanceMonitor.measureOperation(
                        () => requestProcessor.processRequest('moderate', 1),
                        { burstId, requestId, type: 'burst_moderate' }
                    );
                });

                await Promise.all(burstPromises);

                // Wait before next burst
                if (burstId < bursts - 1) {
                    await new Promise(resolve => setTimeout(resolve, burstInterval));
                }
            }

            const stats = performanceMonitor.getStats();

            assert.strictEqual(stats.successful, bursts * requestsPerBurst);
            assert.ok(stats.p99 < 300, `p99 (${stats.p99.toFixed(2)}ms) should handle burst patterns`);

            console.log(`Burst pattern - Total: ${stats.successful}, Mean: ${stats.mean.toFixed(2)}ms, p99: ${stats.p99.toFixed(2)}ms`);
        });
    });

    describe('I/O vs CPU Performance Characteristics', () => {
        it('should characterize I/O bound operations', async () => {
            const requestCount = 30;

            for (let i = 0; i < requestCount; i++) {
                await performanceMonitor.measureOperation(
                    () => requestProcessor.processRequest('io_bound'),
                    { requestId: i, type: 'io_bound' }
                );
            }

            const stats = performanceMonitor.getStats();

            assert.strictEqual(stats.successful, requestCount);

            // I/O bound operations should have higher variability but reasonable p95
            assert.ok(stats.p95 < 200, `I/O operations p95 (${stats.p95.toFixed(2)}ms) should be reasonable`);

            // Check that there's some variability (I/O operations aren't perfectly consistent)
            const variance = stats.max - stats.min;
            assert.ok(variance > 5, 'I/O operations should show some timing variance');

            console.log(`I/O bound - Min: ${stats.min.toFixed(2)}ms, Max: ${stats.max.toFixed(2)}ms, p95: ${stats.p95.toFixed(2)}ms`);
        });

        it('should characterize CPU bound operations', async () => {
            const requestCount = 20;
            const complexity = 3;

            for (let i = 0; i < requestCount; i++) {
                await performanceMonitor.measureOperation(
                    () => requestProcessor.processRequest('cpu_bound', complexity),
                    { requestId: i, type: 'cpu_bound', complexity }
                );
            }

            const stats = performanceMonitor.getStats();

            assert.strictEqual(stats.successful, requestCount);

            // CPU bound operations should be more consistent
            const coefficientOfVariation = (stats.max - stats.min) / stats.mean;
            assert.ok(coefficientOfVariation < 2, 'CPU operations should be relatively consistent');

            console.log(`CPU bound - Mean: ${stats.mean.toFixed(2)}ms, CV: ${coefficientOfVariation.toFixed(2)}, p95: ${stats.p95.toFixed(2)}ms`);
        });
    });

    describe('Performance Degradation Detection', () => {
        it('should detect performance degradation over time', async () => {
            const phaseSize = 20;
            const degradationFactor = 1.5;

            // Phase 1: Baseline performance
            for (let i = 0; i < phaseSize; i++) {
                await performanceMonitor.measureOperation(
                    () => requestProcessor.processRequest('moderate', 1),
                    { phase: 1, requestId: i }
                );
            }

            // Phase 2: Slightly degraded performance
            for (let i = 0; i < phaseSize; i++) {
                await performanceMonitor.measureOperation(
                    () => requestProcessor.processRequest('moderate', degradationFactor),
                    { phase: 2, requestId: i }
                );
            }

            // Phase 3: Further degraded performance
            for (let i = 0; i < phaseSize; i++) {
                await performanceMonitor.measureOperation(
                    () => requestProcessor.processRequest('moderate', degradationFactor * 2),
                    { phase: 3, requestId: i }
                );
            }

            // Analyze performance by phase
            const phase1Measurements = performanceMonitor.measurements.filter(m => m.metadata.phase === 1);
            const phase2Measurements = performanceMonitor.measurements.filter(m => m.metadata.phase === 2);
            const phase3Measurements = performanceMonitor.measurements.filter(m => m.metadata.phase === 3);

            const phase1Mean = phase1Measurements.reduce((sum, m) => sum + m.duration, 0) / phase1Measurements.length;
            const phase2Mean = phase2Measurements.reduce((sum, m) => sum + m.duration, 0) / phase2Measurements.length;
            const phase3Mean = phase3Measurements.reduce((sum, m) => sum + m.duration, 0) / phase3Measurements.length;

            assert.ok(phase2Mean > phase1Mean, 'Phase 2 should be slower than phase 1');
            assert.ok(phase3Mean > phase2Mean, 'Phase 3 should be slower than phase 2');

            const degradationRate = (phase3Mean - phase1Mean) / phase1Mean;
            assert.ok(degradationRate > 0.5, 'Should detect significant performance degradation');

            console.log(`Degradation: P1=${phase1Mean.toFixed(2)}ms, P2=${phase2Mean.toFixed(2)}ms, P3=${phase3Mean.toFixed(2)}ms, Rate=${(degradationRate * 100).toFixed(1)}%`);
        });

        it('should identify performance bottlenecks', async () => {
            const bottleneckAnalyzer = {
                measurements: [],

                addMeasurement(operation, duration, cpuUsage) {
                    this.measurements.push({
                        operation,
                        duration,
                        cpuUsage,
                        cpuIntensity: (cpuUsage.user + cpuUsage.system) / (duration * 1000), // CPU per ms
                        timestamp: Date.now()
                    });
                },

                identifyBottlenecks() {
                    const operations = [...new Set(this.measurements.map(m => m.operation))];
                    const analysis = {};

                    operations.forEach(op => {
                        const opMeasurements = this.measurements.filter(m => m.operation === op);
                        const avgDuration = opMeasurements.reduce((sum, m) => sum + m.duration, 0) / opMeasurements.length;
                        const avgCpuIntensity = opMeasurements.reduce((sum, m) => sum + m.cpuIntensity, 0) / opMeasurements.length;

                        analysis[op] = {
                            avgDuration,
                            avgCpuIntensity,
                            samples: opMeasurements.length,
                            bottleneckType: avgCpuIntensity > 0.5 ? 'cpu_bound' : 'io_bound'
                        };
                    });

                    return analysis;
                }
            };

            // Test different operation types
            const operationTypes = ['simple', 'moderate', 'complex', 'io_bound', 'cpu_bound'];

            for (const opType of operationTypes) {
                const complexity = opType === 'cpu_bound' ? 2 : 1;

                for (let i = 0; i < 10; i++) {
                    const measurement = await performanceMonitor.measureOperation(
                        () => requestProcessor.processRequest(opType, complexity),
                        { operation: opType }
                    );

                    bottleneckAnalyzer.addMeasurement(
                        opType,
                        measurement.duration,
                        measurement.cpuUsage
                    );
                }
            }

            const analysis = bottleneckAnalyzer.identifyBottlenecks();

            // Verify that CPU-bound operations are identified correctly
            assert.strictEqual(analysis.cpu_bound.bottleneckType, 'cpu_bound');
            assert.strictEqual(analysis.io_bound.bottleneckType, 'io_bound');

            // Complex operations should take longer than simple ones
            assert.ok(analysis.complex.avgDuration > analysis.simple.avgDuration);

            console.log('Bottleneck Analysis:');
            Object.entries(analysis).forEach(([op, data]) => {
                console.log(`  ${op}: ${data.avgDuration.toFixed(2)}ms, ${data.bottleneckType}, CPU: ${data.avgCpuIntensity.toFixed(3)}`);
            });
        });
    });

    describe('Performance Threshold Validation', () => {
        it('should validate all performance thresholds', async () => {
            // Run a comprehensive performance test
            const testScenarios = [
                { type: 'simple', count: 50, complexity: 1 },
                { type: 'moderate', count: 30, complexity: 1 },
                { type: 'io_bound', count: 20, complexity: 1 }
            ];

            for (const scenario of testScenarios) {
                for (let i = 0; i < scenario.count; i++) {
                    await performanceMonitor.measureOperation(
                        () => requestProcessor.processRequest(scenario.type, scenario.complexity),
                        { scenario: scenario.type, requestId: i }
                    );
                }
            }

            const thresholdResults = performanceMonitor.checkThresholds();

            // Log results for debugging
            console.log('Performance Threshold Results:');
            Object.entries(thresholdResults).forEach(([metric, result]) => {
                console.log(`  ${metric}: ${result.value.toFixed(2)}ms (threshold: ${result.threshold}ms) - ${result.passed ? 'PASS' : 'FAIL'}`);
            });

            // At least p50 should pass for well-optimized operations
            assert.strictEqual(thresholdResults.p50.passed, true, 'p50 threshold should pass');

            // Store overall results for reporting
            const stats = performanceMonitor.getStats();
            assert.ok(stats.successful > 90, 'Should have high success rate');
            assert.ok(stats.mean < 100, 'Average response time should be reasonable');
        });
    });
});