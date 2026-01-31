/**
 * Advanced Concurrent Request Handler
 *
 * Features:
 * - Request queuing and batching
 * - Priority-based processing
 * - Circuit breaker pattern
 * - Adaptive concurrency limits
 * - Resource pooling
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

class CircuitBreaker {
    constructor(threshold = 5, timeout = 60000) {
        this.failureThreshold = threshold;
        this.timeout = timeout;
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    }

    async execute(fn) {
        if (this.state === 'OPEN') {
            if (performance.now() - this.lastFailureTime > this.timeout) {
                this.state = 'HALF_OPEN';
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    onSuccess() {
        this.failureCount = 0;
        this.state = 'CLOSED';
    }

    onFailure() {
        this.failureCount++;
        this.lastFailureTime = performance.now();

        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }

    getState() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            threshold: this.failureThreshold
        };
    }
}

class AdaptiveConcurrencyLimiter {
    constructor(initialLimit = 10) {
        this.limit = initialLimit;
        this.activeRequests = 0;
        this.successCount = 0;
        this.errorCount = 0;
        this.lastAdjustment = performance.now();
        this.adjustmentInterval = 5000; // 5 seconds
        this.minLimit = 2;
        this.maxLimit = 50;
    }

    async acquire() {
        while (this.activeRequests >= this.limit) {
            await this.sleep(1);
        }
        this.activeRequests++;
    }

    release(success = true) {
        this.activeRequests = Math.max(0, this.activeRequests - 1);

        if (success) {
            this.successCount++;
        } else {
            this.errorCount++;
        }

        this.adjustLimitIfNeeded();
    }

    adjustLimitIfNeeded() {
        const now = performance.now();
        if (now - this.lastAdjustment < this.adjustmentInterval) {
            return;
        }

        const totalRequests = this.successCount + this.errorCount;
        if (totalRequests === 0) return;

        const errorRate = this.errorCount / totalRequests;
        const successRate = this.successCount / totalRequests;

        // Adjust based on error rate and utilization
        if (errorRate > 0.1) { // High error rate, reduce limit
            this.limit = Math.max(this.minLimit, Math.floor(this.limit * 0.8));
        } else if (errorRate < 0.02 && successRate > 0.95) { // Low error rate, increase limit
            this.limit = Math.min(this.maxLimit, Math.floor(this.limit * 1.2));
        }

        // Reset counters
        this.successCount = 0;
        this.errorCount = 0;
        this.lastAdjustment = now;
    }

    getStats() {
        return {
            limit: this.limit,
            activeRequests: this.activeRequests,
            utilization: this.activeRequests / this.limit
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class RequestQueue {
    constructor() {
        this.queues = {
            high: [],
            normal: [],
            low: []
        };
        this.processing = false;
    }

    add(request, priority = 'normal') {
        const queuedRequest = {
            ...request,
            priority,
            queuedAt: performance.now(),
            id: this.generateId()
        };

        this.queues[priority].push(queuedRequest);
        return queuedRequest.id;
    }

    getNext() {
        // Process high priority first, then normal, then low
        for (const priority of ['high', 'normal', 'low']) {
            if (this.queues[priority].length > 0) {
                return this.queues[priority].shift();
            }
        }
        return null;
    }

    size() {
        return this.queues.high.length + this.queues.normal.length + this.queues.low.length;
    }

    getStats() {
        return {
            high: this.queues.high.length,
            normal: this.queues.normal.length,
            low: this.queues.low.length,
            total: this.size()
        };
    }

    generateId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

class ResourcePool {
    constructor(createResource, destroyResource, initialSize = 5, maxSize = 20) {
        this.createResource = createResource;
        this.destroyResource = destroyResource;
        this.initialSize = initialSize;
        this.maxSize = maxSize;

        this.available = [];
        this.inUse = new Set();
        this.creating = 0;

        this.init();
    }

    async init() {
        for (let i = 0; i < this.initialSize; i++) {
            try {
                const resource = await this.createResource();
                this.available.push(resource);
            } catch (error) {
                console.error('Failed to create initial resource:', error);
            }
        }
    }

    async acquire() {
        // Return available resource
        if (this.available.length > 0) {
            const resource = this.available.pop();
            this.inUse.add(resource);
            return resource;
        }

        // Create new resource if under limit
        if (this.inUse.size + this.creating < this.maxSize) {
            this.creating++;
            try {
                const resource = await this.createResource();
                this.creating--;
                this.inUse.add(resource);
                return resource;
            } catch (error) {
                this.creating--;
                throw error;
            }
        }

        // Wait for available resource
        return new Promise((resolve, reject) => {
            const checkAvailable = () => {
                if (this.available.length > 0) {
                    const resource = this.available.pop();
                    this.inUse.add(resource);
                    resolve(resource);
                } else {
                    setTimeout(checkAvailable, 10);
                }
            };
            checkAvailable();
        });
    }

    release(resource) {
        if (this.inUse.has(resource)) {
            this.inUse.delete(resource);
            this.available.push(resource);
        }
    }

    async destroy(resource) {
        this.inUse.delete(resource);
        const index = this.available.indexOf(resource);
        if (index > -1) {
            this.available.splice(index, 1);
        }

        if (this.destroyResource) {
            await this.destroyResource(resource);
        }
    }

    getStats() {
        return {
            available: this.available.length,
            inUse: this.inUse.size,
            creating: this.creating,
            total: this.available.length + this.inUse.size + this.creating
        };
    }
}

class ConcurrentRequestHandler extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            maxConcurrency: options.maxConcurrency || 20,
            batchSize: options.batchSize || 10,
            batchTimeout: options.batchTimeout || 50, // ms
            enableCircuitBreaker: options.enableCircuitBreaker !== false,
            enableAdaptiveLimiting: options.enableAdaptiveLimiting !== false,
            ...options
        };

        this.queue = new RequestQueue();
        this.circuitBreaker = new CircuitBreaker();
        this.concurrencyLimiter = new AdaptiveConcurrencyLimiter(this.options.maxConcurrency);

        // Performance tracking
        this.metrics = {
            processedRequests: 0,
            failedRequests: 0,
            averageProcessingTime: 0,
            queueWaitTime: 0,
            batchesProcessed: 0
        };

        // Start processing
        this.startProcessing();
        this.startMetricsCollection();
    }

    async handleRequest(request, handler, priority = 'normal') {
        return new Promise((resolve, reject) => {
            const wrappedRequest = {
                ...request,
                handler,
                resolve,
                reject,
                startTime: performance.now()
            };

            this.queue.add(wrappedRequest, priority);
        });
    }

    async startProcessing() {
        while (true) {
            try {
                await this.processBatch();
                await this.sleep(1); // Prevent busy waiting
            } catch (error) {
                console.error('Batch processing error:', error);
                await this.sleep(100); // Back off on error
            }
        }
    }

    async processBatch() {
        const batch = [];
        const maxBatchSize = Math.min(this.options.batchSize, this.queue.size());

        // Collect batch
        for (let i = 0; i < maxBatchSize; i++) {
            const request = this.queue.getNext();
            if (!request) break;
            batch.push(request);
        }

        if (batch.length === 0) return;

        // Process batch concurrently
        const promises = batch.map(request => this.processRequest(request));
        await Promise.allSettled(promises);

        this.metrics.batchesProcessed++;
    }

    async processRequest(request) {
        let success = false;
        const startTime = performance.now();

        try {
            // Acquire concurrency limit
            if (this.options.enableAdaptiveLimiting) {
                await this.concurrencyLimiter.acquire();
            }

            // Execute with circuit breaker
            let result;
            if (this.options.enableCircuitBreaker) {
                result = await this.circuitBreaker.execute(() => request.handler(request));
            } else {
                result = await request.handler(request);
            }

            success = true;
            request.resolve(result);

        } catch (error) {
            request.reject(error);
            this.metrics.failedRequests++;
        } finally {
            // Release concurrency limit
            if (this.options.enableAdaptiveLimiting) {
                this.concurrencyLimiter.release(success);
            }

            // Update metrics
            const processingTime = performance.now() - startTime;
            const queueWaitTime = startTime - request.startTime;

            this.updateMetrics(processingTime, queueWaitTime);
        }
    }

    updateMetrics(processingTime, queueWaitTime) {
        this.metrics.processedRequests++;

        // Moving average for processing time
        const alpha = 0.1; // Smoothing factor
        this.metrics.averageProcessingTime =
            this.metrics.averageProcessingTime * (1 - alpha) + processingTime * alpha;

        // Moving average for queue wait time
        this.metrics.queueWaitTime =
            this.metrics.queueWaitTime * (1 - alpha) + queueWaitTime * alpha;
    }

    startMetricsCollection() {
        setInterval(() => {
            this.emit('metrics', this.getMetrics());
        }, 5000); // Every 5 seconds
    }

    getMetrics() {
        return {
            timestamp: Date.now(),
            queue: this.queue.getStats(),
            concurrency: this.concurrencyLimiter.getStats(),
            circuitBreaker: this.circuitBreaker.getState(),
            processing: {
                ...this.metrics,
                requestsPerSecond: this.metrics.processedRequests / ((performance.now() - this.startTime) / 1000)
            }
        };
    }

    // Utility methods
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Request prioritization helpers
    prioritizeRequest(request) {
        // Implement custom prioritization logic
        if (request.method === 'tools/list') {
            return 'high'; // Tool list requests are high priority
        }
        if (request.method?.includes('discover')) {
            return 'high'; // Discovery requests are high priority
        }
        return 'normal';
    }

    // Health check
    isHealthy() {
        const metrics = this.getMetrics();
        const errorRate = metrics.processing.failedRequests /
            (metrics.processing.processedRequests || 1);

        return {
            healthy: errorRate < 0.1 && metrics.circuitBreaker.state === 'CLOSED',
            errorRate,
            queueSize: metrics.queue.total,
            circuitBreakerState: metrics.circuitBreaker.state,
            averageResponseTime: metrics.processing.averageProcessingTime
        };
    }
}

export {
    ConcurrentRequestHandler,
    CircuitBreaker,
    AdaptiveConcurrencyLimiter,
    RequestQueue,
    ResourcePool
};