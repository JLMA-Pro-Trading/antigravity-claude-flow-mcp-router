/**
 * Production Health Monitoring System
 * Provides health checks, metrics collection, and structured logging
 */

import http from 'http';
import { EventEmitter } from 'events';

export class HealthMonitor extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.startTime = Date.now();
        this.metrics = {
            requests: {
                total: 0,
                byMethod: new Map(),
                byStatus: new Map(),
                errors: 0
            },
            performance: {
                responseTimes: [],
                maxResponseTime: 0,
                minResponseTime: Infinity
            },
            backend: {
                restarts: 0,
                toolCalls: 0,
                lastResponse: null,
                status: 'disconnected'
            }
        };

        // Health check server
        this.healthServer = null;
        this.healthPort = process.env.HEALTH_PORT || 3001;

        this.setupHealthServer();
    }

    /**
     * Set up HTTP health check server
     */
    setupHealthServer() {
        this.healthServer = http.createServer((req, res) => {
            res.setHeader('Content-Type', 'application/json');

            if (req.url === '/health') {
                this.handleHealthCheck(req, res);
            } else if (req.url === '/metrics') {
                this.handleMetrics(req, res);
            } else if (req.url === '/ready') {
                this.handleReadiness(req, res);
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not Found' }));
            }
        });

        this.healthServer.listen(this.healthPort, () => {
            this.log('info', `Health monitoring server listening on port ${this.healthPort}`, {
                endpoints: ['/health', '/metrics', '/ready']
            });
        });

        this.healthServer.on('error', (err) => {
            this.log('error', 'Health server error', { error: err.message });
        });
    }

    /**
     * Handle health check requests
     */
    handleHealthCheck(req, res) {
        const health = this.getHealthStatus();
        const status = health.status === 'healthy' ? 200 : 503;

        res.writeHead(status);
        res.end(JSON.stringify(health, null, 2));
    }

    /**
     * Handle metrics requests
     */
    handleMetrics(req, res) {
        const metrics = this.getMetrics();
        res.writeHead(200);
        res.end(JSON.stringify(metrics, null, 2));
    }

    /**
     * Handle readiness probe requests
     */
    handleReadiness(req, res) {
        const isReady = this.isSystemReady();
        const status = isReady ? 200 : 503;

        res.writeHead(status);
        res.end(JSON.stringify({
            ready: isReady,
            timestamp: new Date().toISOString()
        }));
    }

    /**
     * Get comprehensive health status
     */
    getHealthStatus() {
        const uptime = Date.now() - this.startTime;
        const memUsage = process.memoryUsage();
        const errorRate = this.metrics.requests.total > 0
            ? this.metrics.requests.errors / this.metrics.requests.total
            : 0;

        const status = this.calculateOverallStatus(errorRate, memUsage);

        return {
            status,
            version: '4.0.0',
            service: this.config?.name || 'mcp-router',
            uptime: Math.floor(uptime / 1000), // seconds
            timestamp: new Date().toISOString(),
            backend: {
                status: this.metrics.backend.status,
                restarts: this.metrics.backend.restarts,
                lastResponse: this.metrics.backend.lastResponse,
                toolCallsTotal: this.metrics.backend.toolCalls
            },
            performance: {
                totalRequests: this.metrics.requests.total,
                errorRate: Math.round(errorRate * 100) / 100,
                avgResponseTime: this.calculateAverageResponseTime(),
                p95ResponseTime: this.calculatePercentile(95)
            },
            memory: {
                rss: Math.round(memUsage.rss / 1024 / 1024), // MB
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
                external: Math.round(memUsage.external / 1024 / 1024) // MB
            }
        };
    }

    /**
     * Calculate overall system status
     */
    calculateOverallStatus(errorRate, memUsage) {
        const heapUsagePercent = memUsage.heapUsed / memUsage.heapTotal;

        if (this.metrics.backend.status === 'disconnected' && this.metrics.backend.restarts > 5) {
            return 'unhealthy';
        }

        if (errorRate > 0.1 || heapUsagePercent > 0.9) {
            return 'degraded';
        }

        if (this.metrics.backend.status === 'connected') {
            return 'healthy';
        }

        return 'starting';
    }

    /**
     * Get detailed metrics
     */
    getMetrics() {
        return {
            requests: {
                total: this.metrics.requests.total,
                errors: this.metrics.requests.errors,
                byMethod: Object.fromEntries(this.metrics.requests.byMethod),
                byStatus: Object.fromEntries(this.metrics.requests.byStatus)
            },
            performance: {
                averageResponseTime: this.calculateAverageResponseTime(),
                minResponseTime: this.metrics.performance.minResponseTime === Infinity ? 0 : this.metrics.performance.minResponseTime,
                maxResponseTime: this.metrics.performance.maxResponseTime,
                p50: this.calculatePercentile(50),
                p95: this.calculatePercentile(95),
                p99: this.calculatePercentile(99)
            },
            backend: {
                status: this.metrics.backend.status,
                restarts: this.metrics.backend.restarts,
                toolCalls: this.metrics.backend.toolCalls,
                lastResponse: this.metrics.backend.lastResponse
            },
            system: {
                uptime: Math.floor((Date.now() - this.startTime) / 1000),
                memory: process.memoryUsage(),
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            }
        };
    }

    /**
     * Check if system is ready to serve requests
     */
    isSystemReady() {
        return this.metrics.backend.status === 'connected' &&
               this.metrics.backend.restarts < 10;
    }

    /**
     * Record a request
     */
    recordRequest(method, responseTimeMs, status = 'success') {
        this.metrics.requests.total++;

        // Track by method
        const methodCount = this.metrics.requests.byMethod.get(method) || 0;
        this.metrics.requests.byMethod.set(method, methodCount + 1);

        // Track by status
        const statusCount = this.metrics.requests.byStatus.get(status) || 0;
        this.metrics.requests.byStatus.set(status, statusCount + 1);

        if (status === 'error') {
            this.metrics.requests.errors++;
        }

        // Track response times
        if (responseTimeMs !== undefined) {
            this.recordResponseTime(responseTimeMs);
        }

        this.emit('request', { method, responseTimeMs, status });
    }

    /**
     * Record response time
     */
    recordResponseTime(timeMs) {
        this.metrics.performance.responseTimes.push(timeMs);

        // Keep only last 1000 response times
        if (this.metrics.performance.responseTimes.length > 1000) {
            this.metrics.performance.responseTimes.shift();
        }

        this.metrics.performance.maxResponseTime = Math.max(
            this.metrics.performance.maxResponseTime,
            timeMs
        );

        this.metrics.performance.minResponseTime = Math.min(
            this.metrics.performance.minResponseTime,
            timeMs
        );
    }

    /**
     * Record backend status change
     */
    recordBackendStatus(status, toolCount = null) {
        const previousStatus = this.metrics.backend.status;
        this.metrics.backend.status = status;
        this.metrics.backend.lastResponse = new Date().toISOString();

        if (status === 'connected' && toolCount !== null) {
            // Backend is ready with tools
            this.log('info', 'Backend connected successfully', {
                toolCount,
                restarts: this.metrics.backend.restarts
            });
        } else if (status === 'disconnected' && previousStatus === 'connected') {
            // Backend disconnected
            this.metrics.backend.restarts++;
            this.log('warn', 'Backend disconnected', {
                totalRestarts: this.metrics.backend.restarts
            });
        }

        this.emit('backend_status', { status, toolCount });
    }

    /**
     * Record tool call
     */
    recordToolCall(toolName, success = true) {
        this.metrics.backend.toolCalls++;

        if (!success) {
            this.metrics.requests.errors++;
        }

        this.emit('tool_call', { toolName, success });
    }

    /**
     * Calculate average response time
     */
    calculateAverageResponseTime() {
        const times = this.metrics.performance.responseTimes;
        if (times.length === 0) return 0;

        const sum = times.reduce((a, b) => a + b, 0);
        return Math.round(sum / times.length);
    }

    /**
     * Calculate response time percentile
     */
    calculatePercentile(percentile) {
        const times = [...this.metrics.performance.responseTimes].sort((a, b) => a - b);
        if (times.length === 0) return 0;

        const index = Math.ceil((percentile / 100) * times.length) - 1;
        return times[Math.max(0, index)] || 0;
    }

    /**
     * Structured logging
     */
    log(level, message, meta = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            service: this.config?.name || 'mcp-router',
            version: '4.0.0',
            pid: process.pid,
            ...meta
        };

        if (process.env.NODE_ENV === 'production') {
            console.log(JSON.stringify(logEntry));
        } else {
            const prefix = `[${level.toUpperCase()}]`;
            console.log(`${prefix} ${message}`, meta);
        }

        this.emit('log', logEntry);
    }

    /**
     * Clean shutdown
     */
    async shutdown() {
        this.log('info', 'Shutting down health monitor');

        if (this.healthServer) {
            await new Promise((resolve) => {
                this.healthServer.close(resolve);
            });
        }

        this.removeAllListeners();
    }

    /**
     * Get current status for quick checks
     */
    getQuickStatus() {
        return {
            status: this.calculateOverallStatus(
                this.metrics.requests.errors / Math.max(this.metrics.requests.total, 1),
                process.memoryUsage()
            ),
            backendStatus: this.metrics.backend.status,
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            errors: this.metrics.requests.errors
        };
    }
}

/**
 * Request timing middleware
 */
export class RequestTimer {
    constructor() {
        this.timings = new Map();
    }

    start(id) {
        this.timings.set(id, Date.now());
        return id;
    }

    end(id) {
        const startTime = this.timings.get(id);
        if (!startTime) return 0;

        this.timings.delete(id);
        return Date.now() - startTime;
    }

    cleanup() {
        // Clean up old timings (older than 30 seconds)
        const now = Date.now();
        for (const [id, startTime] of this.timings.entries()) {
            if (now - startTime > 30000) {
                this.timings.delete(id);
            }
        }
    }
}

export default HealthMonitor;