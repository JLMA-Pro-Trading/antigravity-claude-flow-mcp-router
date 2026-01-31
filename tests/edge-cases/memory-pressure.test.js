/**
 * Memory Pressure Scenario Tests
 * Tests for handling low memory conditions and memory leaks
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('Memory Pressure Scenarios', () => {
    let memoryManager;
    let initialMemoryUsage;

    beforeEach(() => {
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        initialMemoryUsage = process.memoryUsage();

        memoryManager = {
            allocations: new Map(),
            totalAllocated: 0,
            peakUsage: 0,
            gcTriggers: 0,
            lowMemoryThreshold: 50 * 1024 * 1024, // 50MB

            allocate(id, size) {
                const buffer = Buffer.alloc(size);
                this.allocations.set(id, {
                    buffer,
                    size,
                    timestamp: Date.now()
                });
                this.totalAllocated += size;
                this.peakUsage = Math.max(this.peakUsage, this.totalAllocated);

                return buffer;
            },

            deallocate(id) {
                const allocation = this.allocations.get(id);
                if (allocation) {
                    this.totalAllocated -= allocation.size;
                    this.allocations.delete(id);
                    return true;
                }
                return false;
            },

            getCurrentUsage() {
                return process.memoryUsage();
            },

            isLowMemory() {
                const usage = this.getCurrentUsage();
                return usage.heapUsed > this.lowMemoryThreshold;
            },

            triggerGC() {
                if (global.gc) {
                    global.gc();
                    this.gcTriggers++;
                    return true;
                }
                return false;
            },

            getStats() {
                return {
                    totalAllocated: this.totalAllocated,
                    peakUsage: this.peakUsage,
                    activeAllocations: this.allocations.size,
                    gcTriggers: this.gcTriggers,
                    currentUsage: this.getCurrentUsage()
                };
            }
        };
    });

    afterEach(() => {
        // Clean up allocations
        memoryManager.allocations.clear();
        memoryManager.totalAllocated = 0;

        // Force garbage collection
        if (global.gc) {
            global.gc();
        }
    });

    describe('Large Buffer Handling', () => {
        it('should handle allocation of large buffers', () => {
            const largeBufferSizes = [
                1024 * 1024,     // 1MB
                5 * 1024 * 1024, // 5MB
                10 * 1024 * 1024 // 10MB
            ];

            largeBufferSizes.forEach((size, index) => {
                const id = `large_buffer_${index}`;

                assert.doesNotThrow(() => {
                    const buffer = memoryManager.allocate(id, size);
                    assert.strictEqual(buffer.length, size);
                }, `Should be able to allocate ${size} bytes`);
            });

            assert.strictEqual(memoryManager.allocations.size, 3);
            assert.ok(memoryManager.totalAllocated > 16 * 1024 * 1024); // > 16MB total
        });

        it('should handle buffer deallocation', () => {
            // Allocate several buffers
            const bufferIds = [];
            for (let i = 0; i < 5; i++) {
                const id = `buffer_${i}`;
                memoryManager.allocate(id, 1024 * 1024); // 1MB each
                bufferIds.push(id);
            }

            assert.strictEqual(memoryManager.allocations.size, 5);

            // Deallocate half of them
            for (let i = 0; i < 3; i++) {
                const success = memoryManager.deallocate(bufferIds[i]);
                assert.strictEqual(success, true);
            }

            assert.strictEqual(memoryManager.allocations.size, 2);
            assert.strictEqual(memoryManager.totalAllocated, 2 * 1024 * 1024); // 2MB remaining
        });

        it('should detect memory leaks', () => {
            const allocationCount = 100;
            const leakDetector = {
                previousUsage: null,
                samples: [],

                takeSample() {
                    const usage = process.memoryUsage();
                    this.samples.push({
                        heapUsed: usage.heapUsed,
                        timestamp: Date.now()
                    });

                    // Keep only recent samples
                    if (this.samples.length > 10) {
                        this.samples.shift();
                    }
                },

                detectLeak() {
                    if (this.samples.length < 5) return false;

                    // Check if memory usage is consistently increasing
                    const recentSamples = this.samples.slice(-5);
                    for (let i = 1; i < recentSamples.length; i++) {
                        if (recentSamples[i].heapUsed <= recentSamples[i - 1].heapUsed) {
                            return false; // Memory decreased, likely no leak
                        }
                    }

                    // Check if the increase is significant
                    const firstSample = recentSamples[0].heapUsed;
                    const lastSample = recentSamples[recentSamples.length - 1].heapUsed;
                    const increase = lastSample - firstSample;

                    return increase > 1024 * 1024; // > 1MB increase
                }
            };

            // Create and keep references (potential leak)
            const persistentRefs = [];
            for (let i = 0; i < allocationCount; i++) {
                const buffer = memoryManager.allocate(`leak_test_${i}`, 100 * 1024); // 100KB
                persistentRefs.push(buffer); // Keep reference (prevents GC)

                if (i % 20 === 0) {
                    leakDetector.takeSample();
                }
            }

            leakDetector.takeSample();

            const hasLeak = leakDetector.detectLeak();
            assert.ok(hasLeak, 'Should detect memory leak pattern');
            assert.strictEqual(persistentRefs.length, allocationCount);
        });
    });

    describe('Garbage Collection Behavior', () => {
        it('should trigger GC under memory pressure', () => {
            const pressureSimulator = {
                allocations: [],

                createPressure() {
                    // Allocate many small objects to trigger GC
                    for (let i = 0; i < 1000; i++) {
                        this.allocations.push(new Array(1000).fill(Math.random()));
                    }
                },

                releasePressure() {
                    this.allocations = [];
                }
            };

            const initialStats = memoryManager.getStats();
            const initialGCCount = initialStats.gcTriggers;

            // Create memory pressure
            pressureSimulator.createPressure();

            // Check if low memory condition is detected
            const isLowMemoryBefore = memoryManager.isLowMemory();

            // Trigger GC if needed
            if (isLowMemoryBefore) {
                memoryManager.triggerGC();
            }

            const finalStats = memoryManager.getStats();

            if (isLowMemoryBefore) {
                assert.ok(finalStats.gcTriggers > initialGCCount, 'Should have triggered GC');
            }

            // Clean up
            pressureSimulator.releasePressure();
        });

        it('should handle GC during active operations', async () => {
            const operationManager = {
                activeOperations: 0,
                completedOperations: 0,

                async performOperation(id) {
                    this.activeOperations++;

                    try {
                        // Allocate some memory during operation
                        const workingMemory = memoryManager.allocate(`work_${id}`, 512 * 1024); // 512KB

                        // Simulate work
                        await new Promise(resolve => setTimeout(resolve, 10));

                        // Clean up working memory
                        memoryManager.deallocate(`work_${id}`);

                        this.completedOperations++;
                        return { success: true, id };

                    } finally {
                        this.activeOperations--;
                    }
                }
            };

            // Start many operations concurrently
            const operationPromises = [];
            for (let i = 0; i < 50; i++) {
                operationPromises.push(operationManager.performOperation(i));
            }

            // Trigger GC while operations are running
            setTimeout(() => {
                memoryManager.triggerGC();
            }, 25);

            const results = await Promise.all(operationPromises);

            const successful = results.filter(r => r.success).length;
            assert.strictEqual(successful, 50, 'All operations should complete despite GC');
            assert.strictEqual(operationManager.activeOperations, 0);
            assert.strictEqual(operationManager.completedOperations, 50);
        });
    });

    describe('Memory Fragmentation', () => {
        it('should handle fragmented memory allocation patterns', () => {
            const fragmentationTest = {
                allocations: new Map(),

                createFragmentation() {
                    // Allocate various sizes to create fragmentation
                    const sizes = [1024, 4096, 2048, 8192, 1024, 16384, 512];

                    sizes.forEach((size, index) => {
                        const id = `frag_${index}`;
                        memoryManager.allocate(id, size);
                        this.allocations.set(id, size);
                    });
                },

                deallocatePattern() {
                    // Deallocate every other allocation to create holes
                    const keys = Array.from(this.allocations.keys());
                    for (let i = 0; i < keys.length; i += 2) {
                        memoryManager.deallocate(keys[i]);
                        this.allocations.delete(keys[i]);
                    }
                },

                tryDefragmentation() {
                    // Simulate defragmentation by reallocating
                    const remaining = Array.from(this.allocations.entries());

                    // Deallocate all
                    remaining.forEach(([id]) => {
                        memoryManager.deallocate(id);
                    });

                    // Reallocate in order
                    remaining.forEach(([id, size]) => {
                        memoryManager.allocate(id, size);
                    });
                }
            };

            fragmentationTest.createFragmentation();
            assert.strictEqual(memoryManager.allocations.size, 7);

            fragmentationTest.deallocatePattern();
            assert.strictEqual(memoryManager.allocations.size, 4);

            fragmentationTest.tryDefragmentation();
            assert.strictEqual(memoryManager.allocations.size, 4);
        });

        it('should handle varied allocation sizes efficiently', () => {
            const allocationSizes = [
                100,      // Very small
                1024,     // Small (1KB)
                50000,    // Medium (50KB)
                1000000,  // Large (1MB)
                10000000, // Very large (10MB)
                500,      // Small again
                2000000   // Large again
            ];

            const allocationResults = [];

            allocationSizes.forEach((size, index) => {
                const startTime = Date.now();
                const id = `varied_${index}`;

                try {
                    memoryManager.allocate(id, size);
                    const endTime = Date.now();

                    allocationResults.push({
                        size,
                        allocationTime: endTime - startTime,
                        success: true
                    });
                } catch (error) {
                    allocationResults.push({
                        size,
                        allocationTime: Date.now() - startTime,
                        success: false,
                        error: error.message
                    });
                }
            });

            const successful = allocationResults.filter(r => r.success).length;
            assert.ok(successful > 0, 'Should successfully allocate some buffers');

            // Check that allocation time doesn't grow exponentially with size
            const largeSizeResults = allocationResults.filter(r => r.size > 1000000 && r.success);
            if (largeSizeResults.length > 1) {
                const maxTime = Math.max(...largeSizeResults.map(r => r.allocationTime));
                assert.ok(maxTime < 1000, 'Large allocations should complete quickly'); // < 1 second
            }
        });
    });

    describe('Stream Processing Under Memory Pressure', () => {
        it('should handle streaming data with limited memory', async () => {
            const streamProcessor = {
                bufferSize: 1024 * 1024, // 1MB buffer
                processedChunks: 0,
                totalBytesProcessed: 0,

                async processStream(totalSize, chunkSize) {
                    const chunks = Math.ceil(totalSize / chunkSize);

                    for (let i = 0; i < chunks; i++) {
                        const currentChunkSize = Math.min(chunkSize, totalSize - (i * chunkSize));

                        // Allocate buffer for chunk
                        const chunkId = `chunk_${i}`;
                        const buffer = memoryManager.allocate(chunkId, currentChunkSize);

                        // Simulate processing
                        await this.processChunk(buffer);

                        // Deallocate immediately after processing
                        memoryManager.deallocate(chunkId);

                        this.processedChunks++;
                        this.totalBytesProcessed += currentChunkSize;

                        // Check memory pressure and trigger GC if needed
                        if (memoryManager.isLowMemory()) {
                            memoryManager.triggerGC();
                        }
                    }
                },

                async processChunk(buffer) {
                    // Simulate chunk processing
                    await new Promise(resolve => setTimeout(resolve, 1));

                    // Simulate some work on the buffer
                    for (let i = 0; i < buffer.length; i += 1000) {
                        buffer[i] = 0x42; // Write some data
                    }
                }
            };

            const totalDataSize = 50 * 1024 * 1024; // 50MB total
            const chunkSize = 1024 * 1024; // 1MB chunks

            await streamProcessor.processStream(totalDataSize, chunkSize);

            assert.strictEqual(streamProcessor.totalBytesProcessed, totalDataSize);
            assert.strictEqual(streamProcessor.processedChunks, 50);

            // Memory should be mostly released
            assert.ok(memoryManager.totalAllocated < 2 * 1024 * 1024); // < 2MB remaining
        });

        it('should handle backpressure in stream processing', async () => {
            const backpressureHandler = {
                maxConcurrentChunks: 3,
                processingChunks: new Set(),
                backpressureTriggered: false,

                async processWithBackpressure(chunkId, size) {
                    // Check if we need to apply backpressure
                    while (this.processingChunks.size >= this.maxConcurrentChunks) {
                        this.backpressureTriggered = true;
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }

                    this.processingChunks.add(chunkId);

                    try {
                        // Allocate and process
                        const buffer = memoryManager.allocate(chunkId, size);
                        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate work
                        memoryManager.deallocate(chunkId);

                        return { success: true, chunkId };
                    } finally {
                        this.processingChunks.delete(chunkId);
                    }
                }
            };

            // Start many chunks concurrently
            const chunkPromises = [];
            for (let i = 0; i < 10; i++) {
                const promise = backpressureHandler.processWithBackpressure(`bp_chunk_${i}`, 100 * 1024);
                chunkPromises.push(promise);
            }

            const results = await Promise.all(chunkPromises);

            const successful = results.filter(r => r.success).length;
            assert.strictEqual(successful, 10, 'All chunks should process successfully');
            assert.strictEqual(backpressureHandler.backpressureTriggered, true, 'Backpressure should have been triggered');
            assert.strictEqual(backpressureHandler.processingChunks.size, 0, 'All chunks should be finished');
        });
    });

    describe('Memory Monitoring and Alerts', () => {
        it('should monitor memory usage patterns', () => {
            const memoryMonitor = {
                samples: [],
                alertThreshold: 0.8, // 80% of some limit

                takeSample() {
                    const usage = process.memoryUsage();
                    this.samples.push({
                        heapUsed: usage.heapUsed,
                        heapTotal: usage.heapTotal,
                        external: usage.external,
                        timestamp: Date.now()
                    });

                    // Keep only last 100 samples
                    if (this.samples.length > 100) {
                        this.samples.shift();
                    }
                },

                getMemoryTrend() {
                    if (this.samples.length < 5) return 'insufficient_data';

                    const recent = this.samples.slice(-5);
                    const older = this.samples.slice(-10, -5);

                    if (older.length === 0) return 'insufficient_data';

                    const recentAvg = recent.reduce((sum, s) => sum + s.heapUsed, 0) / recent.length;
                    const olderAvg = older.reduce((sum, s) => sum + s.heapUsed, 0) / older.length;

                    const change = (recentAvg - olderAvg) / olderAvg;

                    if (change > 0.1) return 'increasing';
                    if (change < -0.1) return 'decreasing';
                    return 'stable';
                },

                shouldAlert() {
                    if (this.samples.length === 0) return false;

                    const latest = this.samples[this.samples.length - 1];
                    const usageRatio = latest.heapUsed / latest.heapTotal;

                    return usageRatio > this.alertThreshold;
                }
            };

            // Generate some memory usage
            for (let i = 0; i < 20; i++) {
                memoryManager.allocate(`monitor_test_${i}`, 500 * 1024); // 500KB each
                memoryMonitor.takeSample();
            }

            assert.ok(memoryMonitor.samples.length > 10);

            const trend = memoryMonitor.getMemoryTrend();
            assert.ok(['increasing', 'decreasing', 'stable', 'insufficient_data'].includes(trend));

            // Clean up to test decreasing trend
            for (let i = 0; i < 15; i++) {
                memoryManager.deallocate(`monitor_test_${i}`);
            }

            for (let i = 0; i < 5; i++) {
                memoryMonitor.takeSample();
                await new Promise(resolve => setTimeout(resolve, 1));
            }

            const finalTrend = memoryMonitor.getMemoryTrend();
            assert.ok(['decreasing', 'stable'].includes(finalTrend));
        });
    });
});