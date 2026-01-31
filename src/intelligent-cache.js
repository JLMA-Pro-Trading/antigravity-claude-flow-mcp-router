/**
 * Intelligent Cache System for MCP Router
 *
 * Features:
 * - Multi-tier cache (L1: Memory, L2: LRU, L3: Persistent)
 * - Predictive preloading
 * - Request pattern analysis
 * - TTL with adaptive refresh
 * - Cache warming strategies
 * - Performance analytics
 */

import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

class LRUCache {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return undefined;

        const value = this.cache.get(key);
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remove least recently used (first item)
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    has(key) {
        return this.cache.has(key);
    }

    delete(key) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    size() {
        return this.cache.size;
    }

    keys() {
        return Array.from(this.cache.keys());
    }
}

class CacheEntry {
    constructor(data, ttl = 30000) {
        this.data = data;
        this.timestamp = performance.now();
        this.ttl = ttl;
        this.accessCount = 0;
        this.lastAccessed = this.timestamp;
        this.computeTime = 0; // Time taken to compute this entry
    }

    isExpired() {
        return performance.now() - this.timestamp > this.ttl;
    }

    access() {
        this.accessCount++;
        this.lastAccessed = performance.now();
        return this.data;
    }

    getAge() {
        return performance.now() - this.timestamp;
    }

    getPopularity() {
        const ageInSeconds = this.getAge() / 1000;
        return this.accessCount / Math.max(ageInSeconds, 1);
    }
}

class RequestPattern {
    constructor() {
        this.patterns = new Map();
        this.sequences = [];
        this.maxSequenceLength = 100;
    }

    recordRequest(key, timestamp = performance.now()) {
        // Update individual pattern
        if (!this.patterns.has(key)) {
            this.patterns.set(key, {
                count: 0,
                lastSeen: timestamp,
                intervals: [],
                predictedNext: null
            });
        }

        const pattern = this.patterns.get(key);
        if (pattern.lastSeen) {
            const interval = timestamp - pattern.lastSeen;
            pattern.intervals.push(interval);
            if (pattern.intervals.length > 20) {
                pattern.intervals.shift(); // Keep only recent intervals
            }
        }

        pattern.count++;
        pattern.lastSeen = timestamp;

        // Update sequence
        this.sequences.push({ key, timestamp });
        if (this.sequences.length > this.maxSequenceLength) {
            this.sequences.shift();
        }

        this.updatePredictions(key);
    }

    updatePredictions(currentKey) {
        // Find patterns that follow the current key
        const followingRequests = {};

        for (let i = 0; i < this.sequences.length - 1; i++) {
            if (this.sequences[i].key === currentKey) {
                const nextKey = this.sequences[i + 1].key;
                followingRequests[nextKey] = (followingRequests[nextKey] || 0) + 1;
            }
        }

        // Find most likely next request
        let maxCount = 0;
        let predictedNext = null;

        for (const [nextKey, count] of Object.entries(followingRequests)) {
            if (count > maxCount) {
                maxCount = count;
                predictedNext = nextKey;
            }
        }

        const pattern = this.patterns.get(currentKey);
        if (pattern) {
            pattern.predictedNext = maxCount > 2 ? predictedNext : null;
        }
    }

    getPredictedNext(key) {
        const pattern = this.patterns.get(key);
        return pattern?.predictedNext || null;
    }

    getRequestFrequency(key) {
        const pattern = this.patterns.get(key);
        if (!pattern || pattern.intervals.length === 0) return 0;

        const avgInterval = pattern.intervals.reduce((a, b) => a + b, 0) / pattern.intervals.length;
        return 1000 / avgInterval; // Requests per second
    }

    getPopularRequests(limit = 10) {
        return Array.from(this.patterns.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, limit)
            .map(([key, pattern]) => ({ key, count: pattern.count }));
    }
}

class PredictiveLoader {
    constructor(cache, dataLoader) {
        this.cache = cache;
        this.dataLoader = dataLoader;
        this.loading = new Set();
        this.preloadQueue = new Set();

        // Start background preloading
        this.startPreloadWorker();
    }

    async preload(key, priority = 'normal') {
        if (this.loading.has(key) || this.cache.has(key)) {
            return;
        }

        this.preloadQueue.add({ key, priority, timestamp: performance.now() });
    }

    startPreloadWorker() {
        setInterval(async () => {
            await this.processPreloadQueue();
        }, 100); // Check every 100ms
    }

    async processPreloadQueue() {
        if (this.preloadQueue.size === 0) return;

        // Sort by priority and age
        const sorted = Array.from(this.preloadQueue).sort((a, b) => {
            if (a.priority === 'high' && b.priority !== 'high') return -1;
            if (b.priority === 'high' && a.priority !== 'high') return 1;
            return a.timestamp - b.timestamp;
        });

        // Process up to 3 preload requests concurrently
        const toProcess = sorted.slice(0, 3);

        for (const item of toProcess) {
            this.preloadQueue.delete(item);
            this.loadInBackground(item.key);
        }
    }

    async loadInBackground(key) {
        if (this.loading.has(key)) return;

        this.loading.add(key);
        try {
            const startTime = performance.now();
            const data = await this.dataLoader(key);
            const computeTime = performance.now() - startTime;

            // Cache with appropriate TTL based on data type
            const ttl = this.calculateTTL(key, data);
            this.cache.setWithMetrics(key, data, ttl, computeTime);
        } catch (error) {
            // Silent failure for background loading
        } finally {
            this.loading.delete(key);
        }
    }

    calculateTTL(key, data) {
        // Dynamic TTL based on data characteristics
        if (key.includes('tools/list')) return 60000; // 1 minute for tool lists
        if (key.includes('discover')) return 30000; // 30 seconds for discovery
        if (key.includes('status')) return 5000; // 5 seconds for status
        return 30000; // Default 30 seconds
    }
}

class IntelligentCache extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            l1Size: options.l1Size || 100,        // Hot cache
            l2Size: options.l2Size || 1000,       // LRU cache
            defaultTTL: options.defaultTTL || 30000,
            enablePreloading: options.enablePreloading !== false,
            enableAnalytics: options.enableAnalytics !== false,
            warmupPatterns: options.warmupPatterns || [],
            ...options
        };

        // Multi-tier cache
        this.l1Cache = new Map(); // Hot cache - most frequently accessed
        this.l2Cache = new LRUCache(this.options.l2Size);
        this.persistentCache = new Map(); // Could be Redis/file in production

        // Pattern analysis
        this.requestPatterns = new RequestPattern();
        this.predictiveLoader = null;

        // Analytics
        this.analytics = {
            requests: 0,
            hits: { l1: 0, l2: 0, l3: 0 },
            misses: 0,
            totalResponseTime: 0,
            averageResponseTime: 0
        };

        this.startAnalyticsReporting();
        this.startCacheOptimization();
    }

    setDataLoader(loader) {
        this.dataLoader = loader;
        if (this.options.enablePreloading) {
            this.predictiveLoader = new PredictiveLoader(this, loader);
        }
    }

    async get(key) {
        const startTime = performance.now();
        this.analytics.requests++;

        // Record request pattern
        this.requestPatterns.recordRequest(key);

        // L1 Cache (Hot)
        if (this.l1Cache.has(key)) {
            const entry = this.l1Cache.get(key);
            if (!entry.isExpired()) {
                this.analytics.hits.l1++;
                this.recordResponseTime(startTime);

                // Trigger predictive loading
                this.triggerPredictiveLoading(key);

                return entry.access();
            } else {
                this.l1Cache.delete(key);
            }
        }

        // L2 Cache (LRU)
        if (this.l2Cache.has(key)) {
            const entry = this.l2Cache.get(key);
            if (!entry.isExpired()) {
                this.analytics.hits.l2++;
                this.recordResponseTime(startTime);

                // Promote to L1 if popular enough
                if (entry.getPopularity() > this.calculatePopularityThreshold()) {
                    this.promoteToL1(key, entry);
                }

                this.triggerPredictiveLoading(key);
                return entry.access();
            } else {
                this.l2Cache.delete(key);
            }
        }

        // L3 Cache (Persistent)
        if (this.persistentCache.has(key)) {
            const entry = this.persistentCache.get(key);
            if (!entry.isExpired()) {
                this.analytics.hits.l3++;
                this.recordResponseTime(startTime);

                // Promote to L2
                this.l2Cache.set(key, entry);

                this.triggerPredictiveLoading(key);
                return entry.access();
            } else {
                this.persistentCache.delete(key);
            }
        }

        // Cache miss
        this.analytics.misses++;
        this.recordResponseTime(startTime);
        return null;
    }

    set(key, data, ttl = null) {
        const actualTTL = ttl || this.options.defaultTTL;
        const entry = new CacheEntry(data, actualTTL);

        // Always store in L2 first
        this.l2Cache.set(key, entry);

        // Store in persistent cache for larger items
        if (this.shouldPersist(data)) {
            this.persistentCache.set(key, entry);
        }

        this.emit('set', { key, size: this.estimateSize(data), ttl: actualTTL });
    }

    setWithMetrics(key, data, ttl = null, computeTime = 0) {
        const entry = new CacheEntry(data, ttl || this.options.defaultTTL);
        entry.computeTime = computeTime;

        this.l2Cache.set(key, entry);

        if (this.shouldPersist(data)) {
            this.persistentCache.set(key, entry);
        }

        this.emit('set', { key, computeTime, ttl: entry.ttl });
    }

    has(key) {
        return this.l1Cache.has(key) ||
               this.l2Cache.has(key) ||
               this.persistentCache.has(key);
    }

    delete(key) {
        this.l1Cache.delete(key);
        this.l2Cache.delete(key);
        this.persistentCache.delete(key);
        this.emit('delete', { key });
    }

    clear() {
        this.l1Cache.clear();
        this.l2Cache.clear();
        this.persistentCache.clear();
        this.emit('clear');
    }

    // Promotion logic
    promoteToL1(key, entry) {
        // Remove oldest L1 entry if at capacity
        if (this.l1Cache.size >= this.options.l1Size) {
            this.evictFromL1();
        }

        this.l1Cache.set(key, entry);
        this.emit('promote', { key, tier: 'L1' });
    }

    evictFromL1() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, entry] of this.l1Cache) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.l1Cache.delete(oldestKey);
        }
    }

    calculatePopularityThreshold() {
        // Dynamic threshold based on current cache usage
        const l1Usage = this.l1Cache.size / this.options.l1Size;
        return 5 + (l1Usage * 10); // Higher threshold when L1 is fuller
    }

    shouldPersist(data) {
        const size = this.estimateSize(data);
        return size > 1000; // Persist larger items
    }

    estimateSize(data) {
        return JSON.stringify(data).length;
    }

    triggerPredictiveLoading(key) {
        if (!this.predictiveLoader) return;

        const predictedNext = this.requestPatterns.getPredictedNext(key);
        if (predictedNext && !this.has(predictedNext)) {
            this.predictiveLoader.preload(predictedNext, 'normal');
        }

        // Preload popular items
        const popular = this.requestPatterns.getPopularRequests(5);
        for (const item of popular) {
            if (!this.has(item.key)) {
                this.predictiveLoader.preload(item.key, 'low');
            }
        }
    }

    recordResponseTime(startTime) {
        const responseTime = performance.now() - startTime;
        this.analytics.totalResponseTime += responseTime;
        this.analytics.averageResponseTime =
            this.analytics.totalResponseTime / this.analytics.requests;
    }

    // Cache warming
    async warmCache() {
        if (!this.dataLoader) return;

        console.log('Warming cache with common patterns...');

        const warmupItems = [
            'tools/list',
            'cf_discover_all',
            'status',
            ...this.options.warmupPatterns
        ];

        for (const key of warmupItems) {
            try {
                const data = await this.dataLoader(key);
                this.set(key, data);
            } catch (error) {
                // Silent failure for warmup
            }
        }
    }

    startAnalyticsReporting() {
        if (!this.options.enableAnalytics) return;

        setInterval(() => {
            this.emit('analytics', this.getAnalytics());
        }, 10000); // Every 10 seconds
    }

    startCacheOptimization() {
        // Periodic optimization
        setInterval(() => {
            this.optimizeCache();
        }, 60000); // Every minute
    }

    optimizeCache() {
        // Remove expired entries
        this.cleanupExpired();

        // Analyze and optimize L1 cache
        this.optimizeL1();

        // Emit optimization event
        this.emit('optimize', this.getStats());
    }

    cleanupExpired() {
        const cleanup = (cache) => {
            const toDelete = [];
            for (const [key, entry] of cache) {
                if (entry.isExpired()) {
                    toDelete.push(key);
                }
            }
            toDelete.forEach(key => cache.delete(key));
            return toDelete.length;
        };

        const l1Cleaned = cleanup(this.l1Cache);
        const l2Cleaned = cleanup(this.l2Cache);
        const l3Cleaned = cleanup(this.persistentCache);

        if (l1Cleaned + l2Cleaned + l3Cleaned > 0) {
            this.emit('cleanup', { l1: l1Cleaned, l2: l2Cleaned, l3: l3Cleaned });
        }
    }

    optimizeL1() {
        // Ensure most popular items are in L1
        const allL2Entries = [];
        for (const [key, entry] of this.l2Cache.cache) {
            allL2Entries.push({ key, entry });
        }

        // Sort by popularity
        allL2Entries.sort((a, b) => b.entry.getPopularity() - a.entry.getPopularity());

        // Promote top items to L1 if not already there
        const toPromote = Math.min(this.options.l1Size, allL2Entries.length);
        for (let i = 0; i < toPromote; i++) {
            const { key, entry } = allL2Entries[i];
            if (!this.l1Cache.has(key)) {
                this.promoteToL1(key, entry);
            }
        }
    }

    getAnalytics() {
        const total = this.analytics.hits.l1 + this.analytics.hits.l2 +
                     this.analytics.hits.l3 + this.analytics.misses;

        return {
            ...this.analytics,
            hitRate: total > 0 ? ((this.analytics.hits.l1 + this.analytics.hits.l2 +
                                  this.analytics.hits.l3) / total) * 100 : 0,
            l1HitRate: total > 0 ? (this.analytics.hits.l1 / total) * 100 : 0,
            l2HitRate: total > 0 ? (this.analytics.hits.l2 / total) * 100 : 0,
            l3HitRate: total > 0 ? (this.analytics.hits.l3 / total) * 100 : 0
        };
    }

    getStats() {
        return {
            sizes: {
                l1: this.l1Cache.size,
                l2: this.l2Cache.size(),
                l3: this.persistentCache.size
            },
            capacities: {
                l1: this.options.l1Size,
                l2: this.options.l2Size,
                l3: Infinity
            },
            analytics: this.getAnalytics(),
            patterns: {
                totalPatterns: this.requestPatterns.patterns.size,
                popular: this.requestPatterns.getPopularRequests(5)
            }
        };
    }
}

export { IntelligentCache, CacheEntry, RequestPattern, PredictiveLoader };