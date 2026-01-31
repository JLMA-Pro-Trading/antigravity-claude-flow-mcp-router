/**
 * Memory Usage Performance Tests
 * Tests for monitoring and validating memory consumption patterns
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('Memory Usage Performance', () => {
    let memoryProfiler;
    let baselineMemory;

    beforeEach(() => {
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        baselineMemory = process.memoryUsage();

        memoryProfiler = {
            snapshots: [],
            allocations: new Map(),
            startTime: Date.now(),

            takeSnapshot(label = 'snapshot') {
                const memory = process.memoryUsage();
                const timestamp = Date.now();

                const snapshot = {
                    label,
                    timestamp,
                    heapUsed: memory.heapUsed,
                    heapTotal: memory.heapTotal,
                    external: memory.external,
                    rss: memory.rss,
                    arrayBuffers: memory.arrayBuffers || 0,
                    deltaFromBaseline: {
                        heapUsed: memory.heapUsed - baselineMemory.heapUsed,
                        heapTotal: memory.heapTotal - baselineMemory.heapTotal,
                        rss: memory.rss - baselineMemory.rss
                    }
                };

                this.snapshots.push(snapshot);
                return snapshot;
            },

            trackAllocation(id, size, type = 'buffer') {
                this.allocations.set(id, {
                    size,
                    type,
                    timestamp: Date.now(),
                    heapBefore: process.memoryUsage().heapUsed
                });
            },

            untrackAllocation(id) {
                const allocation = this.allocations.get(id);
                if (allocation) {
                    allocation.heapAfter = process.memoryUsage().heapUsed;
                    allocation.duration = Date.now() - allocation.timestamp;
                    this.allocations.delete(id);
                    return allocation;
                }
                return null;
            },

            getMemoryTrend() {
                if (this.snapshots.length < 3) return 'insufficient_data';

                const recent = this.snapshots.slice(-3);
                const first = recent[0];
                const last = recent[recent.length - 1];

                const heapGrowth = last.heapUsed - first.heapUsed;
                const timespan = last.timestamp - first.timestamp;
                const growthRate = heapGrowth / timespan; // bytes per ms

                if (growthRate > 1000) return 'increasing_fast';  // > 1MB/s
                if (growthRate > 100) return 'increasing_slow';   // > 100KB/s
                if (growthRate < -100) return 'decreasing';
                return 'stable';
            },

            getLeakDetection() {
                if (this.snapshots.length < 5) return null;

                const windows = [];
                for (let i = 0; i < this.snapshots.length - 4; i++) {
                    const window = this.snapshots.slice(i, i + 5);
                    const firstHeap = window[0].heapUsed;
                    const lastHeap = window[window.length - 1].heapUsed;
                    const growth = lastHeap - firstHeap;

                    windows.push({
                        start: i,
                        growth,
                        avgHeap: window.reduce((sum, s) => sum + s.heapUsed, 0) / window.length
                    });
                }

                // Check for consistent growth across windows
                const positiveGrowthWindows = windows.filter(w => w.growth > 0);
                const suspiciousGrowth = positiveGrowthWindows.length / windows.length > 0.7;

                return {
                    suspiciousGrowth,
                    totalWindows: windows.length,
                    positiveGrowthWindows: positiveGrowthWindows.length,
                    avgGrowthRate: windows.reduce((sum, w) => sum + w.growth, 0) / windows.length
                };
            },

            getStats() {
                if (this.snapshots.length === 0) return null;

                const heapValues = this.snapshots.map(s => s.heapUsed);
                const rssValues = this.snapshots.map(s => s.rss);

                return {
                    duration: Date.now() - this.startTime,
                    snapshotCount: this.snapshots.length,
                    heap: {
                        min: Math.min(...heapValues),
                        max: Math.max(...heapValues),
                        current: heapValues[heapValues.length - 1],
                        growth: heapValues[heapValues.length - 1] - heapValues[0]
                    },
                    rss: {
                        min: Math.min(...rssValues),
                        max: Math.max(...rssValues),
                        current: rssValues[rssValues.length - 1],
                        growth: rssValues[rssValues.length - 1] - rssValues[0]
                    },
                    activeAllocations: this.allocations.size,
                    trend: this.getMemoryTrend()
                };
            }
        };
    });

    afterEach(() => {
        // Force cleanup
        if (global.gc) {
            global.gc();
        }
    });

    describe('Memory Allocation Patterns', () => {
        it('should track memory allocation and deallocation', () => {
            memoryProfiler.takeSnapshot('initial');

            // Allocate various buffer sizes
            const allocations = [];
            const sizes = [1024, 4096, 16384, 65536, 262144]; // 1KB to 256KB

            sizes.forEach((size, index) => {
                const id = `buffer_${index}`;
                memoryProfiler.trackAllocation(id, size, 'buffer');

                const buffer = Buffer.alloc(size);
                allocations.push({ id, buffer });

                memoryProfiler.takeSnapshot(`after_alloc_${index}`);
            });

            const afterAllocation = memoryProfiler.takeSnapshot('all_allocated');

            // Deallocate buffers
            allocations.forEach(({ id }, index) => {
                memoryProfiler.untrackAllocation(id);
                allocations[index] = null; // Remove reference
            });

            // Force garbage collection
            if (global.gc) {
                global.gc();
            }

            const afterDeallocation = memoryProfiler.takeSnapshot('deallocated');

            const stats = memoryProfiler.getStats();

            // Verify tracking
            assert.strictEqual(stats.activeAllocations, 0, 'All allocations should be untracked');
            assert.ok(stats.snapshotCount >= 7, 'Should have taken multiple snapshots');

            // Memory should have grown during allocation
            assert.ok(afterAllocation.heapUsed > afterAllocation.deltaFromBaseline.heapUsed + 100000);

            console.log(`Memory test: ${stats.heap.growth} bytes heap growth, trend: ${stats.trend}`);
        });

        it('should detect memory usage patterns under load', async () => {
            const workloadSimulator = {
                async simulateWork(workloadType, intensity = 1) {
                    switch (workloadType) {
                        case 'small_allocations':
                            return this.simulateSmallAllocations(intensity);
                        case 'large_allocations':
                            return this.simulateLargeAllocations(intensity);
                        case 'mixed_allocations':
                            return this.simulateMixedAllocations(intensity);
                        case 'streaming_data':
                            return this.simulateStreamingData(intensity);
                    }
                },

                async simulateSmallAllocations(intensity) {
                    const allocations = [];
                    const count = 100 * intensity;

                    for (let i = 0; i < count; i++) {
                        const size = Math.floor(Math.random() * 1024) + 100; // 100B - 1KB
                        const buffer = Buffer.alloc(size);
                        allocations.push(buffer);

                        if (i % 10 === 0) {
                            memoryProfiler.takeSnapshot(`small_alloc_${i}`);
                            await new Promise(resolve => setTimeout(resolve, 1));
                        }
                    }

                    return allocations;
                },

                async simulateLargeAllocations(intensity) {
                    const allocations = [];
                    const count = 10 * intensity;

                    for (let i = 0; i < count; i++) {
                        const size = Math.floor(Math.random() * 1024 * 1024) + 512 * 1024; // 512KB - 1.5MB
                        const buffer = Buffer.alloc(size);
                        allocations.push(buffer);

                        memoryProfiler.takeSnapshot(`large_alloc_${i}`);
                        await new Promise(resolve => setTimeout(resolve, 5));
                    }

                    return allocations;
                },

                async simulateMixedAllocations(intensity) {
                    const allocations = [];
                    const operations = 50 * intensity;

                    for (let i = 0; i < operations; i++) {
                        const isLarge = Math.random() > 0.7; // 30% large allocations
                        const size = isLarge
                            ? Math.floor(Math.random() * 512 * 1024) + 256 * 1024  // 256KB - 768KB
                            : Math.floor(Math.random() * 4096) + 512;              // 512B - 4KB

                        const buffer = Buffer.alloc(size);
                        allocations.push(buffer);

                        if (i % 5 === 0) {
                            memoryProfiler.takeSnapshot(`mixed_${i}`);
                            await new Promise(resolve => setTimeout(resolve, 2));
                        }
                    }

                    return allocations;
                },

                async simulateStreamingData(intensity) {
                    const chunkSize = 64 * 1024 * intensity; // 64KB per intensity
                    const chunks = 20;
                    let currentChunk = null;

                    for (let i = 0; i < chunks; i++) {
                        // Release previous chunk
                        currentChunk = null;

                        // Allocate new chunk
                        currentChunk = Buffer.alloc(chunkSize);

                        // Simulate processing
                        for (let j = 0; j < chunkSize; j += 1000) {
                            currentChunk[j] = Math.floor(Math.random() * 256);
                        }

                        memoryProfiler.takeSnapshot(`stream_chunk_${i}`);
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }

                    return { chunksProcessed: chunks, chunkSize };
                }
            };

            memoryProfiler.takeSnapshot('workload_start');

            // Test different workload patterns
            const workloads = [
                { type: 'small_allocations', intensity: 2 },
                { type: 'large_allocations', intensity: 1 },
                { type: 'mixed_allocations', intensity: 1 },
                { type: 'streaming_data', intensity: 2 }
            ];

            for (const workload of workloads) {
                const startSnapshot = memoryProfiler.takeSnapshot(`${workload.type}_start`);

                const result = await workloadSimulator.simulateWork(workload.type, workload.intensity);

                const endSnapshot = memoryProfiler.takeSnapshot(`${workload.type}_end`);

                // Force garbage collection after each workload
                if (global.gc) {
                    global.gc();
                }

                const gcSnapshot = memoryProfiler.takeSnapshot(`${workload.type}_gc`);

                console.log(`${workload.type}: ${endSnapshot.heapUsed - startSnapshot.heapUsed} bytes allocated, ${endSnapshot.heapUsed - gcSnapshot.heapUsed} bytes freed by GC`);

                // Brief pause between workloads
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            const finalStats = memoryProfiler.getStats();

            assert.ok(finalStats.snapshotCount > 20, 'Should have taken many snapshots');
            assert.ok(finalStats.duration > 100, 'Test should have taken some time');

            // Memory should be mostly cleaned up
            const finalSnapshot = memoryProfiler.snapshots[memoryProfiler.snapshots.length - 1];
            assert.ok(finalSnapshot.deltaFromBaseline.heapUsed < 10 * 1024 * 1024, 'Memory growth should be reasonable (<10MB)');
        });
    });

    describe('Memory Leak Detection', () => {
        it('should detect potential memory leaks', async () => {
            const leakSimulator = {
                leakyObjects: [],

                simulateLeakyOperation(iteration) {
                    // Simulate a leak by keeping references to objects
                    const data = {
                        id: iteration,
                        timestamp: Date.now(),
                        payload: new Array(1000).fill(Math.random()),
                        circular: null
                    };

                    // Create circular reference (harder to GC)
                    data.circular = { parent: data };

                    // Keep reference (simulating a leak)
                    this.leakyObjects.push(data);

                    return data;
                },

                simulateNormalOperation(iteration) {
                    // Normal operation that doesn't leak
                    const data = {
                        id: iteration,
                        timestamp: Date.now(),
                        payload: new Array(1000).fill(Math.random())
                    };

                    // Process and discard (no persistent reference)
                    return data.payload.reduce((sum, val) => sum + val, 0);
                },

                cleanup() {
                    this.leakyObjects = [];
                }
            };

            // Phase 1: Normal operations (baseline)
            for (let i = 0; i < 20; i++) {
                leakSimulator.simulateNormalOperation(i);
                memoryProfiler.takeSnapshot(`normal_${i}`);
                await new Promise(resolve => setTimeout(resolve, 5));
            }

            // Force GC and measure baseline
            if (global.gc) global.gc();
            const baselineAfterGC = memoryProfiler.takeSnapshot('baseline_after_gc');

            // Phase 2: Leaky operations
            for (let i = 0; i < 30; i++) {
                leakSimulator.simulateLeakyOperation(i);
                memoryProfiler.takeSnapshot(`leaky_${i}`);
                await new Promise(resolve => setTimeout(resolve, 5));
            }

            // Force GC after leaky operations
            if (global.gc) global.gc();
            const leakyAfterGC = memoryProfiler.takeSnapshot('leaky_after_gc');

            const leakDetection = memoryProfiler.getLeakDetection();

            // Verify leak detection
            assert.ok(leakDetection, 'Should have leak detection data');
            assert.ok(leakDetection.suspiciousGrowth, 'Should detect suspicious memory growth pattern');

            const memoryGrowth = leakyAfterGC.heapUsed - baselineAfterGC.heapUsed;
            assert.ok(memoryGrowth > 100000, 'Should show significant memory growth (>100KB)'); // Adjust threshold as needed

            console.log(`Leak detection: ${memoryGrowth} bytes growth, ${leakDetection.positiveGrowthWindows}/${leakDetection.totalWindows} windows with growth`);

            // Cleanup to verify leak resolution
            leakSimulator.cleanup();
            if (global.gc) global.gc();
            const afterCleanup = memoryProfiler.takeSnapshot('after_cleanup');

            const cleanupReduction = leakyAfterGC.heapUsed - afterCleanup.heapUsed;
            assert.ok(cleanupReduction > 50000, 'Cleanup should reduce memory usage significantly');
        });

        it('should monitor long-running operations for leaks', async () => {
            const longRunningSimulator = {
                operationCounter: 0,
                cache: new Map(),
                maxCacheSize: 100,

                async performOperation() {
                    this.operationCounter++;

                    // Simulate some work
                    const workData = new Array(5000).fill(Math.random());
                    const result = workData.reduce((sum, val) => sum + val, 0);

                    // Cache results (with size limit)
                    const cacheKey = `result_${this.operationCounter}`;
                    this.cache.set(cacheKey, { result, timestamp: Date.now() });

                    // Implement cache eviction
                    if (this.cache.size > this.maxCacheSize) {
                        const oldestKey = this.cache.keys().next().value;
                        this.cache.delete(oldestKey);
                    }

                    return result;
                },

                getStats() {
                    return {
                        operations: this.operationCounter,
                        cacheSize: this.cache.size,
                        cacheMemory: this.cache.size * 40000 // Rough estimate
                    };
                }
            };

            const monitoringDuration = 1000; // 1 second
            const operationInterval = 20; // 20ms between operations
            const startTime = Date.now();

            memoryProfiler.takeSnapshot('long_running_start');

            // Run operations for specified duration
            while (Date.now() - startTime < monitoringDuration) {
                await longRunningSimulator.performOperation();

                // Take periodic snapshots
                if (longRunningSimulator.operationCounter % 10 === 0) {
                    memoryProfiler.takeSnapshot(`long_op_${longRunningSimulator.operationCounter}`);
                }

                await new Promise(resolve => setTimeout(resolve, operationInterval));
            }

            memoryProfiler.takeSnapshot('long_running_end');

            const stats = memoryProfiler.getStats();
            const simulatorStats = longRunningSimulator.getStats();

            // Verify bounded memory usage
            assert.ok(stats.heap.growth < 50 * 1024 * 1024, 'Long-running operations should not cause excessive memory growth');
            assert.strictEqual(simulatorStats.cacheSize, longRunningSimulator.maxCacheSize, 'Cache should be bounded');

            console.log(`Long-running test: ${simulatorStats.operations} operations, ${stats.heap.growth} bytes growth, trend: ${stats.trend}`);

            // Check for stable or controlled growth
            assert.ok(['stable', 'increasing_slow'].includes(stats.trend), 'Memory trend should be stable or controlled');
        });
    });

    describe('Memory Efficiency Benchmarks', () => {
        it('should measure memory efficiency of different data structures', () => {
            const dataStructureBenchmark = {
                testArray() {
                    const startHeap = process.memoryUsage().heapUsed;
                    const array = new Array(10000);
                    for (let i = 0; i < 10000; i++) {
                        array[i] = { id: i, value: Math.random() * 1000 };
                    }
                    const endHeap = process.memoryUsage().heapUsed;
                    return { structure: 'Array', memory: endHeap - startHeap, data: array };
                },

                testMap() {
                    const startHeap = process.memoryUsage().heapUsed;
                    const map = new Map();
                    for (let i = 0; i < 10000; i++) {
                        map.set(i, { id: i, value: Math.random() * 1000 });
                    }
                    const endHeap = process.memoryUsage().heapUsed;
                    return { structure: 'Map', memory: endHeap - startHeap, data: map };
                },

                testSet() {
                    const startHeap = process.memoryUsage().heapUsed;
                    const set = new Set();
                    for (let i = 0; i < 10000; i++) {
                        set.add({ id: i, value: Math.random() * 1000 });
                    }
                    const endHeap = process.memoryUsage().heapUsed;
                    return { structure: 'Set', memory: endHeap - startHeap, data: set };
                },

                testBuffer() {
                    const startHeap = process.memoryUsage().heapUsed;
                    const buffer = Buffer.alloc(10000 * 8); // 8 bytes per number
                    for (let i = 0; i < 10000; i++) {
                        buffer.writeDoubleLE(Math.random() * 1000, i * 8);
                    }
                    const endHeap = process.memoryUsage().heapUsed;
                    return { structure: 'Buffer', memory: endHeap - startHeap, data: buffer };
                }
            };

            const results = [];

            memoryProfiler.takeSnapshot('benchmark_start');

            // Test each data structure
            const testMethods = ['testArray', 'testMap', 'testSet', 'testBuffer'];

            testMethods.forEach(method => {
                if (global.gc) global.gc(); // Clear before each test

                const startSnapshot = memoryProfiler.takeSnapshot(`${method}_start`);
                const result = dataStructureBenchmark[method]();
                const endSnapshot = memoryProfiler.takeSnapshot(`${method}_end`);

                result.measuredMemory = endSnapshot.heapUsed - startSnapshot.heapUsed;
                results.push(result);

                console.log(`${result.structure}: ${result.memory} bytes direct, ${result.measuredMemory} bytes measured`);
            });

            // Verify results
            assert.strictEqual(results.length, 4, 'Should have tested 4 data structures');

            // Buffer should be most memory efficient for numeric data
            const bufferResult = results.find(r => r.structure === 'Buffer');
            const arrayResult = results.find(r => r.structure === 'Array');

            assert.ok(bufferResult.memory < arrayResult.memory, 'Buffer should use less memory than Array for numeric data');

            // All structures should use reasonable amounts of memory
            results.forEach(result => {
                assert.ok(result.memory > 0, `${result.structure} should use some memory`);
                assert.ok(result.memory < 10 * 1024 * 1024, `${result.structure} should not use excessive memory (<10MB)`);
            });
        });
    });

    describe('Garbage Collection Impact', () => {
        it('should measure GC effectiveness', async () => {
            const gcAnalyzer = {
                measurements: [],

                async measureGCImpact(allocationPattern) {
                    const beforeGC = process.memoryUsage();
                    const startTime = Date.now();

                    // Allocate memory according to pattern
                    await allocationPattern();

                    const beforeGCTime = Date.now();
                    const afterAllocation = process.memoryUsage();

                    // Force garbage collection
                    if (global.gc) {
                        global.gc();
                    }

                    const afterGCTime = Date.now();
                    const afterGC = process.memoryUsage();

                    const measurement = {
                        allocationTime: beforeGCTime - startTime,
                        gcTime: afterGCTime - beforeGCTime,
                        memoryBeforeAllocation: beforeGC.heapUsed,
                        memoryAfterAllocation: afterAllocation.heapUsed,
                        memoryAfterGC: afterGC.heapUsed,
                        allocated: afterAllocation.heapUsed - beforeGC.heapUsed,
                        freed: afterAllocation.heapUsed - afterGC.heapUsed,
                        effectiveness: (afterAllocation.heapUsed - afterGC.heapUsed) / (afterAllocation.heapUsed - beforeGC.heapUsed)
                    };

                    this.measurements.push(measurement);
                    return measurement;
                }
            };

            // Test different allocation patterns
            const patterns = {
                async shortLivedObjects() {
                    const objects = [];
                    for (let i = 0; i < 5000; i++) {
                        objects.push(new Array(100).fill(Math.random()));
                    }
                    // Objects go out of scope when function returns
                },

                async longLivedObjects() {
                    global.testObjects = global.testObjects || [];
                    for (let i = 0; i < 1000; i++) {
                        global.testObjects.push(new Array(500).fill(Math.random()));
                    }
                },

                async mixedLifetime() {
                    const shortLived = [];
                    global.testMixed = global.testMixed || [];

                    for (let i = 0; i < 3000; i++) {
                        shortLived.push(new Array(50).fill(Math.random()));

                        if (i % 10 === 0) {
                            global.testMixed.push(new Array(200).fill(Math.random()));
                        }
                    }
                }
            };

            for (const [patternName, pattern] of Object.entries(patterns)) {
                const measurement = await gcAnalyzer.measureGCImpact(pattern);

                console.log(`${patternName}: ${measurement.allocated} bytes allocated, ${measurement.freed} bytes freed, ${(measurement.effectiveness * 100).toFixed(1)}% effective`);

                assert.ok(measurement.allocated > 0, 'Should have allocated memory');

                if (patternName === 'shortLivedObjects') {
                    assert.ok(measurement.effectiveness > 0.8, 'GC should be highly effective on short-lived objects');
                }

                memoryProfiler.takeSnapshot(`gc_test_${patternName}`);
            }

            // Cleanup global objects
            delete global.testObjects;
            delete global.testMixed;
            if (global.gc) global.gc();
        });
    });
});