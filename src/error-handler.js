/**
 * Enhanced Error Handler for MCP Router
 * Addresses AQE findings: improved error handling and maintainability
 */

export class RouterError extends Error {
    constructor(message, code = 'ROUTER_ERROR', details = null) {
        super(message);
        this.name = 'RouterError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

export class ErrorHandler {
    constructor(config) {
        this.config = config;
        this.errorCounts = new Map();
        this.lastErrors = [];
        this.maxLastErrors = 10;
    }

    /**
     * Handle errors with categorization and recovery strategies
     */
    handleError(error, context = {}) {
        const errorInfo = this.categorizeError(error);
        this.logError(errorInfo, context);
        this.trackErrorMetrics(errorInfo);

        return this.determineRecoveryAction(errorInfo, context);
    }

    /**
     * Categorize errors for better handling
     */
    categorizeError(error) {
        const categories = {
            BACKEND_CRASH: /backend.*crashed|process.*exited/i,
            CONNECTION_ERROR: /connection.*refused|ECONNREFUSED|socket.*error/i,
            JSON_PARSE_ERROR: /unexpected token|invalid json/i,
            TIMEOUT_ERROR: /timeout|timed out/i,
            VALIDATION_ERROR: /invalid.*params|missing.*required/i,
            PERMISSION_ERROR: /permission.*denied|EACCES|forbidden/i
        };

        for (const [category, pattern] of Object.entries(categories)) {
            if (pattern.test(error.message)) {
                return {
                    category,
                    error,
                    severity: this.getSeverity(category),
                    recoverable: this.isRecoverable(category)
                };
            }
        }

        return {
            category: 'UNKNOWN',
            error,
            severity: 'medium',
            recoverable: true
        };
    }

    /**
     * Determine severity level
     */
    getSeverity(category) {
        const severityMap = {
            BACKEND_CRASH: 'critical',
            CONNECTION_ERROR: 'high',
            JSON_PARSE_ERROR: 'medium',
            TIMEOUT_ERROR: 'medium',
            VALIDATION_ERROR: 'low',
            PERMISSION_ERROR: 'high',
            UNKNOWN: 'medium'
        };
        return severityMap[category] || 'medium';
    }

    /**
     * Check if error is recoverable
     */
    isRecoverable(category) {
        const recoverableErrors = [
            'CONNECTION_ERROR',
            'JSON_PARSE_ERROR',
            'TIMEOUT_ERROR',
            'VALIDATION_ERROR',
            'UNKNOWN'
        ];
        return recoverableErrors.includes(category);
    }

    /**
     * Log error with structured information
     */
    logError(errorInfo, context) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            category: errorInfo.category,
            severity: errorInfo.severity,
            message: errorInfo.error.message,
            context,
            stack: errorInfo.error.stack
        };

        // Add to recent errors
        this.lastErrors.unshift(logEntry);
        if (this.lastErrors.length > this.maxLastErrors) {
            this.lastErrors.pop();
        }

        // Log to stderr with severity prefix
        const prefix = this.getSeverityPrefix(errorInfo.severity);
        process.stderr.write(`${prefix} [${this.config?.name || 'Router'}] ${logEntry.message}\n`);
    }

    /**
     * Get severity prefix for logging
     */
    getSeverityPrefix(severity) {
        const prefixes = {
            critical: '[CRITICAL]',
            high: '[ERROR]',
            medium: '[WARN]',
            low: '[INFO]'
        };
        return prefixes[severity] || '[WARN]';
    }

    /**
     * Track error metrics
     */
    trackErrorMetrics(errorInfo) {
        const key = errorInfo.category;
        const count = this.errorCounts.get(key) || 0;
        this.errorCounts.set(key, count + 1);

        // Alert on repeated errors
        if (count > 5) {
            this.logError({
                category: 'REPEATED_ERROR',
                error: new Error(`Repeated error pattern: ${key} (${count} times)`),
                severity: 'high'
            }, { originalCategory: key });
        }
    }

    /**
     * Determine recovery action based on error type
     */
    determineRecoveryAction(errorInfo, context) {
        const { category, severity, recoverable } = errorInfo;

        if (!recoverable) {
            return { action: 'terminate', reason: 'Non-recoverable error' };
        }

        switch (category) {
            case 'BACKEND_CRASH':
                return { action: 'restart_backend', delay: 1000 };

            case 'CONNECTION_ERROR':
                return { action: 'retry_connection', maxRetries: 3, backoff: 'exponential' };

            case 'JSON_PARSE_ERROR':
                return { action: 'skip_message', log: true };

            case 'TIMEOUT_ERROR':
                return { action: 'retry_request', timeout: context.timeout * 1.5 };

            case 'VALIDATION_ERROR':
                return { action: 'send_error_response', code: -32602 };

            default:
                return { action: 'log_and_continue' };
        }
    }

    /**
     * Create error response for client
     */
    createErrorResponse(id, code, message, data = null) {
        return {
            jsonrpc: '2.0',
            id,
            error: {
                code,
                message,
                data
            }
        };
    }

    /**
     * Get error statistics
     */
    getErrorStats() {
        return {
            totalErrors: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
            errorsByCategory: Object.fromEntries(this.errorCounts),
            recentErrors: this.lastErrors.slice(0, 5),
            health: this.calculateHealthScore()
        };
    }

    /**
     * Calculate health score based on error patterns
     */
    calculateHealthScore() {
        const totalErrors = Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0);
        const criticalErrors = this.errorCounts.get('BACKEND_CRASH') || 0;

        if (criticalErrors > 0) return 'poor';
        if (totalErrors > 10) return 'degraded';
        if (totalErrors > 5) return 'fair';
        return 'good';
    }

    /**
     * Reset error metrics
     */
    reset() {
        this.errorCounts.clear();
        this.lastErrors = [];
    }
}

/**
 * Circuit breaker pattern for backend connections
 */
export class CircuitBreaker {
    constructor(threshold = 5, timeout = 30000) {
        this.failureThreshold = threshold;
        this.timeout = timeout;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.lastFailureTime = null;
    }

    /**
     * Execute operation with circuit breaker protection
     */
    async execute(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = 'HALF_OPEN';
            } else {
                throw new RouterError('Circuit breaker is OPEN', 'CIRCUIT_BREAKER_OPEN');
            }
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    /**
     * Handle successful operation
     */
    onSuccess() {
        this.failureCount = 0;
        this.state = 'CLOSED';
    }

    /**
     * Handle failed operation
     */
    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }

    /**
     * Get circuit breaker status
     */
    getStatus() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            threshold: this.failureThreshold,
            lastFailureTime: this.lastFailureTime
        };
    }
}