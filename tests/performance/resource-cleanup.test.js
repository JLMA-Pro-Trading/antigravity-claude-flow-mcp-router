/**
 * Resource Cleanup Performance Tests
 * Tests for proper resource management and cleanup under various conditions
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';

describe('Resource Cleanup Performance', () => {
    let resourceTracker;
    let cleanupScheduler;

    beforeEach(() => {
        resourceTracker = {
            resources: new Map(),
            totalCreated: 0,
            totalCleaned: 0,
            leakedResources: new Set(),

            createResource(id, type, size = 1024) {
                const resource = {
                    id,
                    type,
                    size,
                    createdAt: Date.now(),
                    lastAccessed: Date.now(),
                    accessCount: 0,
                    data: type === 'buffer' ? Buffer.alloc(size) : new Array(size).fill(Math.random()),
                    cleanup: null
                };

                // Set up automatic cleanup for certain resource types
                if (type === 'temporary') {
                    resource.cleanup = setTimeout(() => {
                        this.cleanupResource(id);
                    }, 5000); // 5 second TTL
                }

                this.resources.set(id, resource);
                this.totalCreated++;

                return resource;
            },

            accessResource(id) {
                const resource = this.resources.get(id);
                if (resource) {
                    resource.lastAccessed = Date.now();
                    resource.accessCount++;
                    return resource;
                }
                return null;
            },

            cleanupResource(id) {
                const resource = this.resources.get(id);
                if (resource) {
                    // Clear any pending cleanup timers
                    if (resource.cleanup) {
                        clearTimeout(resource.cleanup);
                    }

                    // Simulate cleanup work
                    resource.data = null;

                    this.resources.delete(id);
                    this.totalCleaned++;

                    return true;
                }
                return false;
            },

            forceCleanupAll() {
                const ids = Array.from(this.resources.keys());
                ids.forEach(id => this.cleanupResource(id));
                return ids.length;
            },

            findStaleResources(maxAge = 10000) {
                const cutoff = Date.now() - maxAge;
                const stale = [];

                for (const [id, resource] of this.resources) {
                    if (resource.lastAccessed < cutoff) {
                        stale.push({ id, age: Date.now() - resource.lastAccessed });
                    }
                }

                return stale;
            },

            detectLeaks() {
                const suspicious = [];
                const now = Date.now();

                for (const [id, resource] of this.resources) {
                    const age = now - resource.createdAt;
                    const timeSinceAccess = now - resource.lastAccessed;

                    // Consider a resource leaked if it's old and not accessed recently
                    if (age > 30000 && timeSinceAccess > 15000 && resource.accessCount < 5) {
                        suspicious.push({
                            id,
                            type: resource.type,
                            age,
                            timeSinceAccess,
                            accessCount: resource.accessCount
                        });
                    }
                }

                return suspicious;
            },

            getStats() {
                return {
                    active: this.resources.size,
                    totalCreated: this.totalCreated,
                    totalCleaned: this.totalCleaned,
                    cleanupRate: this.totalCleaned / this.totalCreated * 100,
                    memoryUsed: Array.from(this.resources.values())
                        .reduce((sum, r) => sum + (r.size || 0), 0)
                };
            }
        };

        cleanupScheduler = {
            cleanupTasks: [],
            isRunning: false,
            interval: 100,

            scheduleCleanup(task, delay = 0) {
                const scheduledTask = {
                    task,
                    executeAt: Date.now() + delay,
                    id: Math.random().toString(36).substring(7)
                };

                this.cleanupTasks.push(scheduledTask);
                return scheduledTask.id;
            },

            start() {
                if (this.isRunning) return;
                this.isRunning = true;
                this.runCleanupLoop();
            },

            stop() {
                this.isRunning = false;
            },

            async runCleanupLoop() {
                while (this.isRunning) {
                    const now = Date.now();
                    const readyTasks = this.cleanupTasks.filter(task => task.executeAt <= now);

                    // Execute ready tasks
                    for (const task of readyTasks) {
                        try {
                            if (typeof task.task === 'function') {
                                await task.task();
                            }
                        } catch (error) {
                            console.error('Cleanup task failed:', error);
                        }
                    }

                    // Remove completed tasks
                    this.cleanupTasks = this.cleanupTasks.filter(task => task.executeAt > now);

                    await new Promise(resolve => setTimeout(resolve, this.interval));
                }
            },

            getPendingCount() {
                return this.cleanupTasks.length;
            }
        };
    });

    afterEach(() => {
        cleanupScheduler.stop();
        resourceTracker.forceCleanupAll();
    });

    describe('Basic Resource Cleanup', () => {
        it('should clean up resources properly', () => {
            // Create various types of resources
            const resourceIds = [];

            for (let i = 0; i < 10; i++) {
                const id = `resource_${i}`;
                const type = i % 3 === 0 ? 'buffer' : i % 3 === 1 ? 'array' : 'object';
                resourceTracker.createResource(id, type, 1024);
                resourceIds.push(id);
            }

            assert.strictEqual(resourceTracker.resources.size, 10);

            // Clean up half the resources
            for (let i = 0; i < 5; i++) {
                const cleaned = resourceTracker.cleanupResource(resourceIds[i]);
                assert.strictEqual(cleaned, true);
            }

            const stats = resourceTracker.getStats();
            assert.strictEqual(stats.active, 5);
            assert.strictEqual(stats.totalCleaned, 5);
            assert.strictEqual(stats.cleanupRate, 50);

            // Clean up remaining resources
            const remainingCleaned = resourceTracker.forceCleanupAll();
            assert.strictEqual(remainingCleaned, 5);

            const finalStats = resourceTracker.getStats();
            assert.strictEqual(finalStats.active, 0);
            assert.strictEqual(finalStats.cleanupRate, 100);
        });

        it('should handle automatic cleanup timers', async () => {
            // Create temporary resources with automatic cleanup
            for (let i = 0; i < 5; i++) {
                resourceTracker.createResource(`temp_${i}`, 'temporary', 512);
            }

            assert.strictEqual(resourceTracker.resources.size, 5);

            // Wait for automatic cleanup (using a shorter timeout for testing)
            const cleanupPromises = [];
            for (let i = 0; i < 5; i++) {
                const promise = new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (!resourceTracker.resources.has(`temp_${i}`)) {
                            clearInterval(checkInterval);
                            resolve(true);
                        }
                    }, 100);

                    // Safety timeout
                    setTimeout(() => {
                        clearInterval(checkInterval);
                        resolve(false);
                    }, 6000);
                });
                cleanupPromises.push(promise);
            }

            const cleanupResults = await Promise.all(cleanupPromises);
            const successfulCleanups = cleanupResults.filter(Boolean).length;

            assert.ok(successfulCleanups >= 4, 'Most resources should be cleaned up automatically');
        });

        it('should detect and handle stale resources', async () => {
            // Create resources with different access patterns
            const activeResourceIds = [];
            const staleResourceIds = [];

            // Create active resources
            for (let i = 0; i < 5; i++) {
                const id = `active_${i}`;
                resourceTracker.createResource(id, 'buffer', 1024);
                activeResourceIds.push(id);
            }

            // Create stale resources (older)
            for (let i = 0; i < 5; i++) {
                const id = `stale_${i}`;
                const resource = resourceTracker.createResource(id, 'buffer', 1024);
                // Artificially age the resource
                resource.createdAt = Date.now() - 20000; // 20 seconds ago
                resource.lastAccessed = Date.now() - 15000; // 15 seconds ago
                staleResourceIds.push(id);
            }

            // Simulate access to active resources
            activeResourceIds.forEach(id => {
                resourceTracker.accessResource(id);
            });

            // Find stale resources
            const staleResources = resourceTracker.findStaleResources(10000); // 10 second threshold

            assert.strictEqual(staleResources.length, 5, 'Should identify all stale resources');

            // Clean up stale resources
            let cleanedCount = 0;
            staleResources.forEach(stale => {
                if (resourceTracker.cleanupResource(stale.id)) {
                    cleanedCount++;
                }
            });

            assert.strictEqual(cleanedCount, 5, 'Should clean up all stale resources');
            assert.strictEqual(resourceTracker.resources.size, 5, 'Only active resources should remain');
        });
    });

    describe('Scheduled Cleanup Performance', () => {
        it('should handle scheduled cleanup tasks efficiently', async () => {
            cleanupScheduler.start();

            const taskResults = [];
            const taskCount = 20;

            // Schedule multiple cleanup tasks with different delays
            for (let i = 0; i < taskCount; i++) {
                const delay = Math.random() * 500; // 0-500ms delay
                const taskId = cleanupScheduler.scheduleCleanup(
                    () => {
                        taskResults.push({
                            id: i,
                            executedAt: Date.now(),
                            delay
                        });
                        return `Task ${i} completed`;
                    },
                    delay
                );

                assert.ok(taskId, 'Should return task ID');
            }

            assert.strictEqual(cleanupScheduler.getPendingCount(), taskCount);

            // Wait for all tasks to complete
            const maxWait = 1000;
            const startWait = Date.now();

            while (cleanupScheduler.getPendingCount() > 0 && Date.now() - startWait < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            cleanupScheduler.stop();

            assert.strictEqual(taskResults.length, taskCount, 'All tasks should execute');
            assert.strictEqual(cleanupScheduler.getPendingCount(), 0, 'No pending tasks should remain');

            // Verify execution order roughly respects scheduling delays
            taskResults.sort((a, b) => a.executedAt - b.executedAt);

            // First executed task should have been one with smaller delay
            const firstTask = taskResults[0];
            const lastTask = taskResults[taskResults.length - 1];

            assert.ok(firstTask.delay <= lastTask.delay * 2, 'Tasks should execute in roughly correct order');
        });

        it('should handle cleanup under memory pressure', async () => {
            const memoryPressureSimulator = {
                largeAllocations: [],

                createMemoryPressure() {
                    // Allocate large chunks of memory to simulate pressure
                    for (let i = 0; i < 10; i++) {
                        const allocation = Buffer.alloc(1024 * 1024); // 1MB each
                        this.largeAllocations.push(allocation);
                    }
                },

                releaseMemoryPressure() {
                    this.largeAllocations = [];
                    if (global.gc) {
                        global.gc();
                    }
                }
            };

            const initialMemory = process.memoryUsage().heapUsed;

            // Create many resources
            const resourceCount = 100;
            for (let i = 0; i < resourceCount; i++) {
                resourceTracker.createResource(`mem_resource_${i}`, 'buffer', 10 * 1024); // 10KB each
            }

            const afterCreation = process.memoryUsage().heapUsed;

            // Simulate memory pressure
            memoryPressureSimulator.createMemoryPressure();

            const underPressure = process.memoryUsage().heapUsed;

            // Perform aggressive cleanup under pressure
            cleanupScheduler.start();

            const cleanupTasksScheduled = [];
            const batchSize = 10;

            for (let batch = 0; batch < resourceCount / batchSize; batch++) {
                const taskId = cleanupScheduler.scheduleCleanup(
                    () => {
                        // Clean up a batch of resources
                        let cleaned = 0;
                        for (let i = batch * batchSize; i < (batch + 1) * batchSize; i++) {
                            if (resourceTracker.cleanupResource(`mem_resource_${i}`)) {
                                cleaned++;
                            }
                        }
                        return cleaned;
                    },
                    batch * 50 // Stagger cleanup
                );

                cleanupTasksScheduled.push(taskId);
            }

            // Wait for cleanup to complete
            while (cleanupScheduler.getPendingCount() > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            cleanupScheduler.stop();

            const afterCleanup = process.memoryUsage().heapUsed;

            // Release memory pressure
            memoryPressureSimulator.releaseMemoryPressure();

            const afterRelease = process.memoryUsage().heapUsed;

            const stats = resourceTracker.getStats();

            assert.strictEqual(stats.active, 0, 'All resources should be cleaned up');
            assert.ok(afterCleanup < underPressure, 'Memory usage should decrease after cleanup');

            console.log(`Memory test: Initial: ${(initialMemory / 1024 / 1024).toFixed(1)}MB, ` +
                       `After creation: ${(afterCreation / 1024 / 1024).toFixed(1)}MB, ` +
                       `Under pressure: ${(underPressure / 1024 / 1024).toFixed(1)}MB, ` +
                       `After cleanup: ${(afterCleanup / 1024 / 1024).toFixed(1)}MB`);
        });
    });

    describe('Leak Detection and Prevention', () => {
        it('should detect resource leaks accurately', async () => {
            const leakSimulator = {
                normalResources: [],
                leakedResources: [],

                createNormalResource(id) {
                    const resource = resourceTracker.createResource(`normal_${id}`, 'buffer', 1024);
                    this.normalResources.push(resource);
                    return resource;
                },

                createLeakedResource(id) {
                    const resource = resourceTracker.createResource(`leaked_${id}`, 'buffer', 1024);
                    // Artificially age the resource to simulate a leak
                    resource.createdAt = Date.now() - 35000; // 35 seconds ago
                    resource.lastAccessed = Date.now() - 20000; // 20 seconds ago
                    resource.accessCount = 1; // Minimal access
                    this.leakedResources.push(resource);
                    return resource;
                },

                simulateNormalUsage() {
                    // Access and cleanup normal resources
                    this.normalResources.forEach(resource => {
                        resourceTracker.accessResource(resource.id);
                    });

                    // Clean up half of them
                    for (let i = 0; i < Math.floor(this.normalResources.length / 2); i++) {
                        resourceTracker.cleanupResource(this.normalResources[i].id);
                    }
                }
            };

            // Create mix of normal and leaked resources
            for (let i = 0; i < 10; i++) {
                leakSimulator.createNormalResource(i);
                leakSimulator.createLeakedResource(i);
            }

            leakSimulator.simulateNormalUsage();

            // Detect leaks
            const suspiciousResources = resourceTracker.detectLeaks();

            assert.ok(suspiciousResources.length > 0, 'Should detect leaked resources');

            // All detected leaks should actually be from leaked resources
            const leakedIds = suspiciousResources.map(s => s.id);
            const actualLeakedIds = leakSimulator.leakedResources.map(r => r.id);

            const correctDetections = leakedIds.filter(id => actualLeakedIds.includes(id));
            const detectionAccuracy = correctDetections.length / suspiciousResources.length;

            assert.ok(detectionAccuracy >= 0.8, 'Leak detection should be reasonably accurate');

            console.log(`Leak detection: ${suspiciousResources.length} suspected, ` +
                       `${correctDetections.length} correct, ` +
                       `${(detectionAccuracy * 100).toFixed(1)}% accuracy`);

            // Clean up detected leaks
            suspiciousResources.forEach(suspicious => {
                resourceTracker.cleanupResource(suspicious.id);
            });

            const finalLeaks = resourceTracker.detectLeaks();
            assert.ok(finalLeaks.length < suspiciousResources.length, 'Cleanup should reduce detected leaks');
        });

        it('should prevent resource accumulation over time', async () => {
            const accumulationMonitor = {
                snapshots: [],

                takeSnapshot() {
                    const stats = resourceTracker.getStats();
                    const memory = process.memoryUsage();

                    this.snapshots.push({
                        timestamp: Date.now(),
                        activeResources: stats.active,
                        totalCreated: stats.totalCreated,
                        memoryUsed: stats.memoryUsed,
                        heapUsed: memory.heapUsed
                    });
                },

                analyzeAccumulation() {
                    if (this.snapshots.length < 3) return null;

                    const first = this.snapshots[0];
                    const last = this.snapshots[this.snapshots.length - 1];

                    return {
                        duration: last.timestamp - first.timestamp,
                        resourceGrowth: last.activeResources - first.activeResources,
                        memoryGrowth: last.heapUsed - first.heapUsed,
                        creationRate: (last.totalCreated - first.totalCreated) /
                                     ((last.timestamp - first.timestamp) / 1000)
                    };
                }
            };

            cleanupScheduler.start();

            // Simulate sustained operation with periodic cleanup
            const operationDuration = 1500; // 1.5 seconds
            const startTime = Date.now();
            let operationId = 0;

            accumulationMonitor.takeSnapshot();

            while (Date.now() - startTime < operationDuration) {
                // Create some resources
                for (let i = 0; i < 5; i++) {
                    const id = `op_${operationId}_resource_${i}`;
                    resourceTracker.createResource(id, 'buffer', 1024);
                }

                // Schedule cleanup for 70% of resources with delay
                const resourcesThisOp = Array.from({ length: 5 }, (_, i) => `op_${operationId}_resource_${i}`);
                const resourcesToCleanup = resourcesThisOp.slice(0, Math.floor(resourcesThisOp.length * 0.7));

                resourcesToCleanup.forEach((resourceId, index) => {
                    cleanupScheduler.scheduleCleanup(
                        () => resourceTracker.cleanupResource(resourceId),
                        100 + index * 50 // Staggered cleanup
                    );
                });

                operationId++;

                // Take periodic snapshots
                if (operationId % 10 === 0) {
                    accumulationMonitor.takeSnapshot();
                }

                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Wait for cleanup tasks to complete
            while (cleanupScheduler.getPendingCount() > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            accumulationMonitor.takeSnapshot();
            cleanupScheduler.stop();

            const analysis = accumulationMonitor.analyzeAccumulation();

            assert.ok(analysis, 'Should have analysis data');

            // Resource accumulation should be controlled
            const resourceGrowthRate = analysis.resourceGrowth / (analysis.duration / 1000); // resources per second
            assert.ok(resourceGrowthRate < 10, 'Resource growth rate should be controlled (<10 resources/sec)');

            // Memory growth should be reasonable
            const memoryGrowthMB = analysis.memoryGrowth / (1024 * 1024);
            assert.ok(memoryGrowthMB < 50, 'Memory growth should be reasonable (<50MB)');

            console.log(`Accumulation test: ${analysis.resourceGrowth} resources, ` +
                       `${memoryGrowthMB.toFixed(1)}MB memory, ` +
                       `${analysis.creationRate.toFixed(1)} resources/sec creation rate`);

            // Final cleanup
            const remaining = resourceTracker.forceCleanupAll();
            console.log(`Final cleanup: ${remaining} resources remaining`);
        });
    });

    describe('Cleanup Performance Under Load', () => {
        it('should maintain cleanup performance during high resource turnover', async () => {
            const turnoverTest = {
                metricsHistory: [],
                operationCount: 0,

                async performOperation() {
                    this.operationCount++;
                    const startTime = Date.now();

                    // Create resources
                    const resourceIds = [];
                    for (let i = 0; i < 10; i++) {
                        const id = `turnover_${this.operationCount}_${i}`;
                        resourceTracker.createResource(id, 'buffer', 2048);
                        resourceIds.push(id);
                    }

                    // Use resources briefly
                    resourceIds.forEach(id => {
                        resourceTracker.accessResource(id);
                    });

                    // Immediately clean up most resources
                    for (let i = 0; i < 8; i++) {
                        resourceTracker.cleanupResource(resourceIds[i]);
                    }

                    const duration = Date.now() - startTime;
                    this.metricsHistory.push({
                        operation: this.operationCount,
                        duration,
                        resourcesCreated: 10,
                        resourcesCleaned: 8,
                        timestamp: Date.now()
                    });

                    return duration;
                },

                getPerformanceAnalysis() {
                    if (this.metricsHistory.length === 0) return null;

                    const durations = this.metricsHistory.map(m => m.duration);
                    const sum = durations.reduce((a, b) => a + b, 0);

                    return {
                        operations: this.metricsHistory.length,
                        avgDuration: sum / durations.length,
                        minDuration: Math.min(...durations),
                        maxDuration: Math.max(...durations),
                        p95Duration: this.calculatePercentile(durations, 95)
                    };
                },

                calculatePercentile(values, percentile) {
                    const sorted = [...values].sort((a, b) => a - b);
                    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
                    return sorted[index] || 0;
                }
            };

            cleanupScheduler.start();

            // Perform many high-turnover operations
            const operationCount = 50;
            const operations = [];

            for (let i = 0; i < operationCount; i++) {
                operations.push(turnoverTest.performOperation());

                // Small delay between operations
                await new Promise(resolve => setTimeout(resolve, 20));
            }

            const results = await Promise.all(operations);
            const analysis = turnoverTest.getPerformanceAnalysis();

            cleanupScheduler.stop();

            assert.strictEqual(analysis.operations, operationCount);
            assert.ok(analysis.avgDuration < 50, 'Average operation duration should be fast (<50ms)');
            assert.ok(analysis.p95Duration < 100, 'p95 duration should be reasonable (<100ms)');

            // Check that performance doesn't degrade over time
            const firstHalf = turnoverTest.metricsHistory.slice(0, Math.floor(operationCount / 2));
            const secondHalf = turnoverTest.metricsHistory.slice(Math.floor(operationCount / 2));

            const firstHalfAvg = firstHalf.reduce((sum, m) => sum + m.duration, 0) / firstHalf.length;
            const secondHalfAvg = secondHalf.reduce((sum, m) => sum + m.duration, 0) / secondHalf.length;

            const performanceDegradation = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;

            assert.ok(performanceDegradation < 1.0, 'Performance should not degrade significantly over time');

            console.log(`Turnover test: ${analysis.operations} ops, ` +
                       `avg: ${analysis.avgDuration.toFixed(2)}ms, ` +
                       `p95: ${analysis.p95Duration.toFixed(2)}ms, ` +
                       `degradation: ${(performanceDegradation * 100).toFixed(1)}%`);

            // Verify resource state
            const finalStats = resourceTracker.getStats();
            assert.ok(finalStats.active < operationCount, 'Should not accumulate too many active resources');
        });
    });
});