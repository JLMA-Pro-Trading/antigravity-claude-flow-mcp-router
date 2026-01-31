/**
 * Security Validator - Enhanced JSON-RPC Security Layer
 * Addresses critical security requirements for production deployment
 */

import { RouterError } from './error-handler.js';

/**
 * Security Error class for validation failures
 */
export class SecurityError extends RouterError {
    constructor(message, code = 'SECURITY_VIOLATION', details = null) {
        super(message, code, details);
        this.name = 'SecurityError';
    }
}

/**
 * Secure JSON processor with prototype pollution protection
 */
export class SecureJSONProcessor {
    static MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB default
    static MAX_NESTING_DEPTH = 10;
    static BLOCKED_KEYS = ['__proto__', 'constructor', 'prototype'];

    /**
     * Safely parse JSON with security validations
     */
    static parse(input, options = {}) {
        const maxSize = options.maxSize || this.MAX_PAYLOAD_SIZE;
        const maxDepth = options.maxDepth || this.MAX_NESTING_DEPTH;

        // Size validation
        if (typeof input !== 'string') {
            throw new SecurityError('Invalid input type - expected string');
        }

        if (input.length > maxSize) {
            throw new SecurityError(
                `Payload too large: ${input.length} bytes (max: ${maxSize})`,
                'PAYLOAD_TOO_LARGE',
                { size: input.length, maxSize }
            );
        }

        // Structure validation
        if (!this.isValidJSONStructure(input)) {
            throw new SecurityError('Invalid JSON structure detected');
        }

        try {
            const parsed = JSON.parse(input, this.createSecureReviver(maxDepth));

            // Additional validation after parsing
            this.validateParsedObject(parsed);

            return parsed;
        } catch (error) {
            if (error instanceof SecurityError) {
                throw error;
            }
            throw new SecurityError(
                `JSON parsing failed: ${error.message}`,
                'JSON_PARSE_FAILED',
                { originalError: error.message }
            );
        }
    }

    /**
     * Create a secure JSON reviver function
     */
    static createSecureReviver(maxDepth) {
        let currentDepth = 0;

        return function(key, value) {
            // Prevent prototype pollution
            if (SecureJSONProcessor.BLOCKED_KEYS.includes(key)) {
                throw new SecurityError(
                    `Blocked property key detected: ${key}`,
                    'BLOCKED_PROPERTY'
                );
            }

            // Track nesting depth
            if (typeof value === 'object' && value !== null) {
                currentDepth++;
                if (currentDepth > maxDepth) {
                    throw new SecurityError(
                        `Maximum nesting depth exceeded: ${currentDepth}`,
                        'MAX_DEPTH_EXCEEDED'
                    );
                }
            }

            // Validate string lengths
            if (typeof value === 'string' && value.length > 10000) {
                throw new SecurityError(
                    `String value too long: ${value.length} characters`,
                    'STRING_TOO_LONG'
                );
            }

            return value;
        };
    }

    /**
     * Basic JSON structure validation before parsing
     */
    static isValidJSONStructure(input) {
        // Check for balanced braces/brackets
        let braceCount = 0;
        let bracketCount = 0;
        let inString = false;
        let escaped = false;

        for (let i = 0; i < input.length; i++) {
            const char = input[i];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (char === '"' && !escaped) {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '{') braceCount++;
                else if (char === '}') braceCount--;
                else if (char === '[') bracketCount++;
                else if (char === ']') bracketCount--;

                // Early validation failure
                if (braceCount < 0 || bracketCount < 0) {
                    return false;
                }
            }
        }

        return braceCount === 0 && bracketCount === 0;
    }

    /**
     * Validate parsed object for security issues
     */
    static validateParsedObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return; // Primitives are safe
        }

        // Check for suspicious properties on prototype chain
        for (const prop in obj) {
            if (Object.prototype.hasOwnProperty.call(Object.prototype, prop)) {
                throw new SecurityError(
                    `Prototype pollution attempt detected: ${prop}`,
                    'PROTOTYPE_POLLUTION'
                );
            }
        }

        // Recursively validate nested objects
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null) {
                this.validateParsedObject(value);
            }
        }
    }
}

/**
 * Rate limiter for DoS protection
 */
export class MessageRateLimiter {
    constructor(options = {}) {
        this.maxRequests = options.maxRequests || 100;
        this.windowMs = options.windowMs || 60000; // 1 minute
        this.requestCounts = new Map();
        this.blockedUntil = new Map();
        this.blockDurationMs = options.blockDurationMs || 300000; // 5 minutes
    }

    /**
     * Check if request is allowed for client
     */
    isAllowed(clientId = 'default') {
        const now = Date.now();

        // Check if client is currently blocked
        if (this.isBlocked(clientId, now)) {
            return false;
        }

        // Get client request history
        const clientRequests = this.requestCounts.get(clientId) || [];

        // Remove requests outside current window
        const validRequests = clientRequests.filter(
            timestamp => now - timestamp < this.windowMs
        );

        // Check rate limit
        if (validRequests.length >= this.maxRequests) {
            // Block client for repeated violations
            this.blockClient(clientId, now);
            return false;
        }

        // Record this request
        validRequests.push(now);
        this.requestCounts.set(clientId, validRequests);

        return true;
    }

    /**
     * Check if client is currently blocked
     */
    isBlocked(clientId, now = Date.now()) {
        const blockedUntil = this.blockedUntil.get(clientId);
        return blockedUntil && now < blockedUntil;
    }

    /**
     * Block client for specified duration
     */
    blockClient(clientId, now = Date.now()) {
        this.blockedUntil.set(clientId, now + this.blockDurationMs);
    }

    /**
     * Get rate limiting statistics
     */
    getStats() {
        const now = Date.now();
        const activeClients = Array.from(this.requestCounts.keys()).filter(
            clientId => {
                const requests = this.requestCounts.get(clientId) || [];
                return requests.some(timestamp => now - timestamp < this.windowMs);
            }
        );

        const blockedClients = Array.from(this.blockedUntil.keys()).filter(
            clientId => this.isBlocked(clientId, now)
        );

        return {
            activeClients: activeClients.length,
            blockedClients: blockedClients.length,
            totalRequestsLastWindow: activeClients.reduce((total, clientId) => {
                const requests = this.requestCounts.get(clientId) || [];
                return total + requests.filter(t => now - t < this.windowMs).length;
            }, 0)
        };
    }

    /**
     * Clean up old entries to prevent memory leaks
     */
    cleanup() {
        const now = Date.now();

        // Clean request counts
        for (const [clientId, requests] of this.requestCounts.entries()) {
            const validRequests = requests.filter(
                timestamp => now - timestamp < this.windowMs
            );

            if (validRequests.length === 0) {
                this.requestCounts.delete(clientId);
            } else {
                this.requestCounts.set(clientId, validRequests);
            }
        }

        // Clean blocked clients
        for (const [clientId, blockedUntil] of this.blockedUntil.entries()) {
            if (now >= blockedUntil) {
                this.blockedUntil.delete(clientId);
            }
        }
    }
}

/**
 * Resource monitor for process security
 */
export class ResourceMonitor {
    constructor(options = {}) {
        this.thresholds = {
            maxMemoryMB: options.maxMemoryMB || 512,
            maxCpuPercent: options.maxCpuPercent || 80,
            maxUptimeHours: options.maxUptimeHours || 24,
            maxOpenFiles: options.maxOpenFiles || 1024
        };

        this.alerts = [];
        this.metrics = {
            memoryUsage: 0,
            cpuUsage: 0,
            uptime: 0,
            alertCount: 0
        };
    }

    /**
     * Check all resource limits
     */
    checkLimits() {
        const violations = [];

        // Memory check
        const memoryUsage = process.memoryUsage();
        const memoryMB = memoryUsage.heapUsed / (1024 * 1024);
        this.metrics.memoryUsage = memoryMB;

        if (memoryMB > this.thresholds.maxMemoryMB) {
            violations.push({
                type: 'MEMORY_LIMIT_EXCEEDED',
                current: memoryMB,
                threshold: this.thresholds.maxMemoryMB,
                unit: 'MB'
            });
        }

        // Uptime check
        const uptimeHours = process.uptime() / 3600;
        this.metrics.uptime = uptimeHours;

        if (uptimeHours > this.thresholds.maxUptimeHours) {
            violations.push({
                type: 'UPTIME_LIMIT_EXCEEDED',
                current: uptimeHours,
                threshold: this.thresholds.maxUptimeHours,
                unit: 'hours'
            });
        }

        // Record violations
        if (violations.length > 0) {
            const alert = {
                timestamp: new Date().toISOString(),
                violations,
                action: 'SECURITY_ALERT'
            };

            this.alerts.push(alert);
            this.metrics.alertCount++;

            // Keep only recent alerts
            if (this.alerts.length > 100) {
                this.alerts = this.alerts.slice(-50);
            }

            throw new SecurityError(
                `Resource limits violated: ${violations.map(v => v.type).join(', ')}`,
                'RESOURCE_LIMIT_VIOLATION',
                { violations }
            );
        }

        return true;
    }

    /**
     * Get current resource metrics
     */
    getMetrics() {
        const memUsage = process.memoryUsage();

        return {
            memory: {
                heapUsed: Math.round(memUsage.heapUsed / (1024 * 1024)),
                heapTotal: Math.round(memUsage.heapTotal / (1024 * 1024)),
                external: Math.round(memUsage.external / (1024 * 1024)),
                rss: Math.round(memUsage.rss / (1024 * 1024))
            },
            process: {
                pid: process.pid,
                uptime: Math.round(process.uptime()),
                version: process.version,
                platform: process.platform
            },
            thresholds: this.thresholds,
            alerts: this.alerts.length,
            violations: this.alerts.filter(a =>
                Date.now() - new Date(a.timestamp).getTime() < 3600000 // Last hour
            ).length
        };
    }
}

/**
 * Security event logger
 */
export class SecurityLogger {
    constructor(options = {}) {
        this.logLevel = options.logLevel || 'info';
        this.maxLogSize = options.maxLogSize || 1000;
        this.events = [];
    }

    /**
     * Log security event
     */
    logSecurityEvent(event, details = {}, severity = 'info') {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event,
            severity,
            source: 'mcp-router-security',
            details: {
                ...details,
                process: {
                    pid: process.pid,
                    memory: process.memoryUsage().heapUsed,
                    uptime: process.uptime()
                }
            }
        };

        this.events.push(logEntry);

        // Maintain log size
        if (this.events.length > this.maxLogSize) {
            this.events = this.events.slice(-Math.floor(this.maxLogSize / 2));
        }

        // Output to stderr for monitoring
        const prefix = this.getSeverityPrefix(severity);
        process.stderr.write(
            `${prefix} [SECURITY] ${event}: ${JSON.stringify(details)}\n`
        );

        return logEntry;
    }

    /**
     * Get severity prefix
     */
    getSeverityPrefix(severity) {
        const prefixes = {
            critical: '[CRITICAL]',
            high: '[ERROR]',
            medium: '[WARN]',
            low: '[INFO]',
            info: '[INFO]'
        };
        return prefixes[severity] || '[INFO]';
    }

    /**
     * Get recent security events
     */
    getRecentEvents(limit = 50) {
        return this.events.slice(-limit);
    }

    /**
     * Get events by severity
     */
    getEventsBySeverity(severity, hours = 24) {
        const since = Date.now() - (hours * 60 * 60 * 1000);

        return this.events.filter(event =>
            event.severity === severity &&
            new Date(event.timestamp).getTime() > since
        );
    }
}

/**
 * Complete security validation middleware
 */
export class SecurityValidator {
    constructor(options = {}) {
        this.jsonProcessor = SecureJSONProcessor;
        this.rateLimiter = new MessageRateLimiter(options.rateLimit);
        this.resourceMonitor = new ResourceMonitor(options.resources);
        this.logger = new SecurityLogger(options.logging);

        // Cleanup interval for memory management
        this.cleanupInterval = setInterval(() => {
            this.rateLimiter.cleanup();
        }, 300000); // 5 minutes
    }

    /**
     * Validate incoming message with full security checks
     */
    validateMessage(message, clientId = 'default') {
        const startTime = Date.now();

        try {
            // Rate limiting check
            if (!this.rateLimiter.isAllowed(clientId)) {
                this.logger.logSecurityEvent(
                    'RATE_LIMIT_EXCEEDED',
                    { clientId },
                    'medium'
                );
                throw new SecurityError(
                    'Rate limit exceeded',
                    'RATE_LIMIT_EXCEEDED'
                );
            }

            // Resource monitoring
            this.resourceMonitor.checkLimits();

            // JSON validation and parsing
            const parsed = this.jsonProcessor.parse(message);

            // Additional JSON-RPC specific validation
            this.validateJSONRPCStructure(parsed);

            const duration = Date.now() - startTime;
            this.logger.logSecurityEvent(
                'MESSAGE_VALIDATED',
                { clientId, duration, messageSize: message.length },
                'info'
            );

            return parsed;

        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.logSecurityEvent(
                'VALIDATION_FAILED',
                {
                    clientId,
                    duration,
                    error: error.message,
                    errorCode: error.code
                },
                'high'
            );
            throw error;
        }
    }

    /**
     * Validate JSON-RPC 2.0 structure
     */
    validateJSONRPCStructure(message) {
        // Required fields
        if (!message.jsonrpc || message.jsonrpc !== '2.0') {
            throw new SecurityError(
                'Invalid or missing JSON-RPC version',
                'INVALID_JSONRPC_VERSION'
            );
        }

        // Method validation for requests
        if (message.method) {
            if (typeof message.method !== 'string') {
                throw new SecurityError(
                    'Method must be a string',
                    'INVALID_METHOD_TYPE'
                );
            }

            if (message.method.length > 128) {
                throw new SecurityError(
                    'Method name too long',
                    'METHOD_NAME_TOO_LONG'
                );
            }

            // Block potentially dangerous methods
            const blockedMethods = ['eval', 'exec', '__proto__'];
            if (blockedMethods.includes(message.method)) {
                throw new SecurityError(
                    `Blocked method: ${message.method}`,
                    'BLOCKED_METHOD'
                );
            }
        }

        // ID validation
        if (message.id !== null && message.id !== undefined) {
            if (typeof message.id !== 'string' && typeof message.id !== 'number') {
                throw new SecurityError(
                    'ID must be string, number, or null',
                    'INVALID_ID_TYPE'
                );
            }
        }

        return true;
    }

    /**
     * Get security statistics
     */
    getSecurityStats() {
        return {
            rateLimiting: this.rateLimiter.getStats(),
            resources: this.resourceMonitor.getMetrics(),
            recentEvents: this.logger.getRecentEvents(20),
            criticalEvents: this.logger.getEventsBySeverity('critical', 24),
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

/**
 * Factory function for creating security validator
 */
export function createSecurityValidator(options = {}) {
    return new SecurityValidator(options);
}

/**
 * Default security configuration for production
 */
export const PRODUCTION_SECURITY_CONFIG = {
    rateLimit: {
        maxRequests: 60, // 60 requests per minute
        windowMs: 60000,
        blockDurationMs: 300000 // 5 minute block
    },
    resources: {
        maxMemoryMB: 256,
        maxCpuPercent: 70,
        maxUptimeHours: 12,
        maxOpenFiles: 512
    },
    logging: {
        logLevel: 'info',
        maxLogSize: 500
    }
};

/**
 * Development security configuration (more lenient)
 */
export const DEVELOPMENT_SECURITY_CONFIG = {
    rateLimit: {
        maxRequests: 200,
        windowMs: 60000,
        blockDurationMs: 60000 // 1 minute block
    },
    resources: {
        maxMemoryMB: 1024,
        maxCpuPercent: 90,
        maxUptimeHours: 48,
        maxOpenFiles: 1024
    },
    logging: {
        logLevel: 'debug',
        maxLogSize: 1000
    }
};