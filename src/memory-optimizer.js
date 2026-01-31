/**
 * Memory Optimization Module for MCP Router
 *
 * Features:
 * - Memory pool management
 * - Buffer recycling
 * - Garbage collection optimization
 * - Memory leak detection
 * - Resource monitoring
 * - Automatic cleanup strategies
 */

import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

class MemoryPool {
    constructor(createFn, resetFn, initialSize = 10, maxSize = 100) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.initialSize = initialSize;
        this.maxSize = maxSize;

        this.available = [];
        this.inUse = new Set();
        this.created = 0;

        this.initialize();
    }

    initialize() {
        for (let i = 0; i < this.initialSize; i++) {
            const obj = this.createFn();
            this.available.push(obj);
            this.created++;
        }
    }

    acquire() {
        let obj;

        if (this.available.length > 0) {
            obj = this.available.pop();
        } else if (this.created < this.maxSize) {
            obj = this.createFn();
            this.created++;
        } else {
            // Pool exhausted, return null or create temporary object
            return null;
        }

        this.inUse.add(obj);
        return obj;
    }

    release(obj) {
        if (!this.inUse.has(obj)) return false;

        this.inUse.delete(obj);

        if (this.resetFn) {
            this.resetFn(obj);
        }

        if (this.available.length < this.maxSize / 2) {
            this.available.push(obj);
        }
        // If pool is full, let object be garbage collected

        return true;
    }

    getStats() {
        return {
            created: this.created,
            available: this.available.length,
            inUse: this.inUse.size,
            utilization: this.inUse.size / this.created
        };
    }

    cleanup() {
        // Release excess objects if pool is underutilized
        const utilizationThreshold = 0.3;
        const stats = this.getStats();

        if (stats.utilization < utilizationThreshold && this.available.length > this.initialSize) {
            const toRemove = Math.floor((this.available.length - this.initialSize) / 2);
            this.available.splice(0, toRemove);
            this.created -= toRemove;
        }
    }
}

class BufferPool {
    constructor() {
        this.pools = new Map();
        this.standardSizes = [1024, 4096, 8192, 16384, 32768, 65536]; // Common buffer sizes
        this.maxBuffersPerSize = 50;

        this.initializePools();
    }

    initializePools() {
        for (const size of this.standardSizes) {
            this.pools.set(size, new MemoryPool(
                () => Buffer.allocUnsafe(size),
                (buffer) => buffer.fill(0), // Clear buffer
                10,
                this.maxBuffersPerSize
            ));
        }
    }

    getBuffer(requestedSize) {
        // Find the smallest buffer size that fits the request
        const size = this.standardSizes.find(s => s >= requestedSize) || requestedSize;

        const pool = this.pools.get(size);
        if (pool) {
            const buffer = pool.acquire();
            if (buffer) {
                return buffer.subarray(0, requestedSize);
            }
        }

        // Fallback to direct allocation
        return Buffer.allocUnsafe(requestedSize);
    }

    releaseBuffer(buffer) {
        const size = this.standardSizes.find(s => s === buffer.length);
        if (size) {
            const pool = this.pools.get(size);
            if (pool) {
                return pool.release(buffer);
            }
        }
        return false;
    }

    getStats() {
        const stats = {};
        for (const [size, pool] of this.pools) {
            stats[size] = pool.getStats();
        }
        return stats;
    }

    cleanup() {
        for (const pool of this.pools.values()) {
            pool.cleanup();
        }
    }
}

class ObjectPool {
    constructor() {
        this.jsonParsers = new MemoryPool(
            () => ({ parse: JSON.parse.bind(JSON) }),
            (obj) => obj.lastUsed = Date.now(),
            5,
            20
        );

        this.responseObjects = new MemoryPool(
            () => ({ jsonrpc: '2.0', id: null, result: null, error: null }),
            (obj) => {
                obj.id = null;
                obj.result = null;
                obj.error = null;
            },
            10,
            50
        );

        this.requestObjects = new MemoryPool(
            () => ({ jsonrpc: '2.0', id: null, method: null, params: null }),
            (obj) => {
                obj.id = null;
                obj.method = null;
                obj.params = null;
            },
            10,
            50
        );
    }

    getResponseObject() {
        return this.responseObjects.acquire() || {
            jsonrpc: '2.0', id: null, result: null, error: null
        };
    }

    releaseResponseObject(obj) {
        return this.responseObjects.release(obj);
    }

    getRequestObject() {
        return this.requestObjects.acquire() || {
            jsonrpc: '2.0', id: null, method: null, params: null
        };
    }

    releaseRequestObject(obj) {
        return this.requestObjects.release(obj);
    }

    getStats() {
        return {
            jsonParsers: this.jsonParsers.getStats(),
            responseObjects: this.responseObjects.getStats(),
            requestObjects: this.requestObjects.getStats()
        };
    }

    cleanup() {
        this.jsonParsers.cleanup();
        this.responseObjects.cleanup();
        this.requestObjects.cleanup();
    }
}

class MemoryMonitor extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            alertThreshold: options.alertThreshold || 0.8, // 80% of heap
            criticalThreshold: options.criticalThreshold || 0.9, // 90% of heap
            monitorInterval: options.monitorInterval || 5000, // 5 seconds
            gcThreshold: options.gcThreshold || 0.85, // Trigger GC at 85%
            ...options
        };

        this.baseline = null;
        this.samples = [];
        this.maxSamples = 100;
        this.isMonitoring = false;

        // Memory leak detection
        this.objectCounts = new Map();
        this.growthPatterns = new Map();
    }

    start() {
        if (this.isMonitoring) return;

        this.isMonitoring = true;
        this.baseline = this.getCurrentMemory();

        this.monitorInterval = setInterval(() => {
            this.collectSample();
        }, this.options.monitorInterval);

        this.emit('started', { baseline: this.baseline });
    }

    stop() {
        if (!this.isMonitoring) return;

        this.isMonitoring = false;
        clearInterval(this.monitorInterval);
        this.emit('stopped');
    }

    collectSample() {
        const memory = this.getCurrentMemory();
        const sample = {
            ...memory,
            timestamp: Date.now(),
            growth: this.baseline ? memory.heapUsed - this.baseline.heapUsed : 0
        };

        this.samples.push(sample);
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }

        this.analyzeMemoryUsage(sample);
        this.detectMemoryLeaks(sample);
        this.checkThresholds(sample);

        this.emit('sample', sample);
    }

    getCurrentMemory() {
        const memUsage = process.memoryUsage();
        return {
            ...memUsage,
            heapUsedPercent: memUsage.heapUsed / memUsage.heapTotal,
            rss: memUsage.rss,
            external: memUsage.external
        };
    }

    analyzeMemoryUsage(sample) {
        if (this.samples.length < 10) return;

        // Calculate trend
        const recent = this.samples.slice(-10);
        const growthRate = this.calculateGrowthRate(recent);

        // Memory pressure analysis
        const pressure = this.calculateMemoryPressure(sample);

        this.emit('analysis', {
            growthRate,
            pressure,
            recommendation: this.generateRecommendation(growthRate, pressure)
        });
    }

    calculateGrowthRate(samples) {
        if (samples.length < 2) return 0;

        const first = samples[0];
        const last = samples[samples.length - 1];
        const timeDiff = last.timestamp - first.timestamp;
        const memoryDiff = last.heapUsed - first.heapUsed;

        return timeDiff > 0 ? (memoryDiff / timeDiff) * 1000 : 0; // bytes per second
    }

    calculateMemoryPressure(sample) {
        const pressure = {
            heap: sample.heapUsedPercent,
            external: sample.external / sample.heapTotal,
            overall: Math.max(sample.heapUsedPercent, sample.external / sample.heapTotal)
        };

        pressure.level = pressure.overall > this.options.criticalThreshold ? 'critical' :
                        pressure.overall > this.options.alertThreshold ? 'high' :
                        pressure.overall > 0.6 ? 'medium' : 'low';

        return pressure;
    }

    generateRecommendation(growthRate, pressure) {
        const recommendations = [];

        if (pressure.level === 'critical') {
            recommendations.push('IMMEDIATE: Force garbage collection');
            recommendations.push('IMMEDIATE: Clear caches');
            recommendations.push('Consider increasing heap size');
        } else if (pressure.level === 'high') {
            recommendations.push('Trigger garbage collection');
            recommendations.push('Clear old cache entries');
        }

        if (growthRate > 1024 * 1024) { // > 1MB/s growth
            recommendations.push('Memory leak suspected - investigate object creation');
            recommendations.push('Check for unclosed resources');
        }

        return recommendations;
    }

    detectMemoryLeaks(sample) {
        // Simple leak detection based on consistent growth
        if (this.samples.length < 20) return;

        const recentGrowth = this.samples.slice(-5).every(s => s.growth > 0);
        const significantGrowth = sample.growth > 50 * 1024 * 1024; // 50MB

        if (recentGrowth && significantGrowth) {
            this.emit('leak-warning', {
                growth: sample.growth,
                pattern: 'consistent-growth',
                samples: this.samples.slice(-5)
            });
        }
    }

    checkThresholds(sample) {
        if (sample.heapUsedPercent > this.options.criticalThreshold) {
            this.emit('critical-memory', sample);
        } else if (sample.heapUsedPercent > this.options.alertThreshold) {
            this.emit('high-memory', sample);
        }

        // Trigger garbage collection if needed
        if (sample.heapUsedPercent > this.options.gcThreshold && global.gc) {
            this.emit('gc-triggered', sample);
            global.gc();
        }
    }

    getStats() {
        if (this.samples.length === 0) return null;

        const latest = this.samples[this.samples.length - 1];
        const oldest = this.samples[0];

        return {
            current: latest,
            baseline: this.baseline,
            totalGrowth: latest.heapUsed - oldest.heapUsed,
            averageGrowth: this.calculateGrowthRate(this.samples),
            samples: this.samples.length,
            uptime: latest.timestamp - oldest.timestamp
        };
    }
}

class MemoryOptimizer extends EventEmitter {
    constructor(options = {}) {
        super();

        this.bufferPool = new BufferPool();
        this.objectPool = new ObjectPool();
        this.monitor = new MemoryMonitor(options);

        // Optimization strategies
        this.strategies = new Map([
            ['aggressive-gc', this.aggressiveGC.bind(this)],
            ['cache-cleanup', this.cleanupCaches.bind(this)],
            ['pool-optimization', this.optimizePools.bind(this)],
            ['buffer-consolidation', this.consolidateBuffers.bind(this)]
        ]);

        this.setupEventHandlers();
        this.startOptimization();
    }

    setupEventHandlers() {
        this.monitor.on('high-memory', () => {
            this.executeStrategy('cache-cleanup');
        });

        this.monitor.on('critical-memory', () => {
            this.executeStrategy('aggressive-gc');
            this.executeStrategy('cache-cleanup');
            this.executeStrategy('pool-optimization');
        });

        this.monitor.on('leak-warning', (info) => {
            this.emit('memory-leak-detected', info);
        });
    }

    startOptimization() {
        this.monitor.start();

        // Regular optimization
        setInterval(() => {
            this.performRoutineOptimization();
        }, 30000); // Every 30 seconds

        // Pool maintenance
        setInterval(() => {
            this.bufferPool.cleanup();
            this.objectPool.cleanup();
        }, 60000); // Every minute
    }

    performRoutineOptimization() {
        const stats = this.monitor.getStats();
        if (!stats) return;

        const pressure = this.monitor.calculateMemoryPressure(stats.current);

        if (pressure.level === 'high' || pressure.level === 'critical') {
            this.executeStrategy('pool-optimization');
        }

        if (stats.averageGrowth > 512 * 1024) { // 512KB/s average growth
            this.executeStrategy('cache-cleanup');
        }
    }

    executeStrategy(strategyName) {
        const strategy = this.strategies.get(strategyName);
        if (strategy) {
            try {
                strategy();
                this.emit('strategy-executed', { name: strategyName });
            } catch (error) {
                this.emit('strategy-error', { name: strategyName, error });
            }
        }
    }

    aggressiveGC() {
        if (global.gc) {
            global.gc();
        }

        // Force cleanup of internal Node.js pools
        if (process.binding && process.binding('util')) {
            try {
                process.binding('util').clearImmediate?.();
            } catch (e) {
                // Ignore errors
            }
        }
    }

    cleanupCaches() {
        // Emit cache cleanup request
        this.emit('cleanup-request', { type: 'caches', aggressive: true });
    }

    optimizePools() {
        this.bufferPool.cleanup();
        this.objectPool.cleanup();
    }

    consolidateBuffers() {
        // Request buffer consolidation from buffer pool
        this.emit('consolidate-buffers');
    }

    // Utility methods for optimized operations
    getOptimizedBuffer(size) {
        return this.bufferPool.getBuffer(size);
    }

    releaseOptimizedBuffer(buffer) {
        return this.bufferPool.releaseBuffer(buffer);
    }

    getResponseObject() {
        return this.objectPool.getResponseObject();
    }

    releaseResponseObject(obj) {
        return this.objectPool.releaseResponseObject(obj);
    }

    getRequestObject() {
        return this.objectPool.getRequestObject();
    }

    releaseRequestObject(obj) {
        return this.objectPool.releaseRequestObject(obj);
    }

    getStats() {
        return {
            memory: this.monitor.getStats(),
            bufferPool: this.bufferPool.getStats(),
            objectPool: this.objectPool.getStats()
        };
    }

    stop() {
        this.monitor.stop();
    }
}

export {
    MemoryOptimizer,
    MemoryMonitor,
    MemoryPool,
    BufferPool,
    ObjectPool
};