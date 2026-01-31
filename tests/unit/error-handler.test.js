/**
 * Unit Tests for Error Handler
 * Addresses AQE findings: increase test coverage from 70% to 80%+
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { ErrorHandler, RouterError, CircuitBreaker } from '../../src/error-handler.js';

describe('ErrorHandler', () => {
    let errorHandler;
    let mockConfig;

    beforeEach(() => {
        mockConfig = { name: 'test-router' };
        errorHandler = new ErrorHandler(mockConfig);
    });

    afterEach(() => {
        errorHandler.reset();
    });

    describe('constructor', () => {
        it('should initialize with config', () => {
            assert.strictEqual(errorHandler.config, mockConfig);
            assert.ok(errorHandler.errorCounts instanceof Map);
            assert.strictEqual(errorHandler.lastErrors.length, 0);
        });
    });

    describe('categorizeError', () => {
        it('should categorize backend crash errors', () => {
            const error = new Error('backend process crashed');
            const result = errorHandler.categorizeError(error);

            assert.strictEqual(result.category, 'BACKEND_CRASH');
            assert.strictEqual(result.severity, 'critical');
            assert.strictEqual(result.recoverable, false);
        });

        it('should categorize connection errors', () => {
            const error = new Error('connection refused ECONNREFUSED');
            const result = errorHandler.categorizeError(error);

            assert.strictEqual(result.category, 'CONNECTION_ERROR');
            assert.strictEqual(result.severity, 'high');
            assert.strictEqual(result.recoverable, true);
        });

        it('should categorize JSON parse errors', () => {
            const error = new Error('Unexpected token in JSON');
            const result = errorHandler.categorizeError(error);

            assert.strictEqual(result.category, 'JSON_PARSE_ERROR');
            assert.strictEqual(result.severity, 'medium');
            assert.strictEqual(result.recoverable, true);
        });

        it('should categorize unknown errors', () => {
            const error = new Error('Some random error');
            const result = errorHandler.categorizeError(error);

            assert.strictEqual(result.category, 'UNKNOWN');
            assert.strictEqual(result.severity, 'medium');
            assert.strictEqual(result.recoverable, true);
        });
    });

    describe('handleError', () => {
        it('should handle and log errors', () => {
            const error = new Error('Test error');
            const context = { operation: 'test' };

            const result = errorHandler.handleError(error, context);

            assert.ok(result);
            assert.strictEqual(errorHandler.lastErrors.length, 1);
            assert.strictEqual(errorHandler.errorCounts.get('UNKNOWN'), 1);
        });

        it('should track repeated errors', () => {
            const error = new Error('Repeated error');

            // Simulate repeated errors
            for (let i = 0; i < 7; i++) {
                errorHandler.handleError(error);
            }

            assert.ok(errorHandler.errorCounts.get('UNKNOWN') >= 6);
            // Should have generated an alert for repeated errors
            const repeatedErrorLog = errorHandler.lastErrors.find(log =>
                log.message.includes('Repeated error pattern')
            );
            assert.ok(repeatedErrorLog);
        });
    });

    describe('determineRecoveryAction', () => {
        it('should suggest backend restart for crashes', () => {
            const errorInfo = {
                category: 'BACKEND_CRASH',
                severity: 'critical',
                recoverable: false
            };

            const action = errorHandler.determineRecoveryAction(errorInfo, {});
            assert.strictEqual(action.action, 'terminate');
            assert.strictEqual(action.reason, 'Non-recoverable error');
        });

        it('should suggest retry for connection errors', () => {
            const errorInfo = {
                category: 'CONNECTION_ERROR',
                severity: 'high',
                recoverable: true
            };

            const action = errorHandler.determineRecoveryAction(errorInfo, {});
            assert.strictEqual(action.action, 'retry_connection');
            assert.strictEqual(action.maxRetries, 3);
        });

        it('should skip malformed JSON', () => {
            const errorInfo = {
                category: 'JSON_PARSE_ERROR',
                severity: 'medium',
                recoverable: true
            };

            const action = errorHandler.determineRecoveryAction(errorInfo, {});
            assert.strictEqual(action.action, 'skip_message');
            assert.strictEqual(action.log, true);
        });
    });

    describe('createErrorResponse', () => {
        it('should create valid JSON-RPC error response', () => {
            const response = errorHandler.createErrorResponse(123, -32602, 'Invalid params');

            assert.strictEqual(response.jsonrpc, '2.0');
            assert.strictEqual(response.id, 123);
            assert.strictEqual(response.error.code, -32602);
            assert.strictEqual(response.error.message, 'Invalid params');
        });

        it('should include error data when provided', () => {
            const data = { details: 'more info' };
            const response = errorHandler.createErrorResponse(456, -32603, 'Internal error', data);

            assert.deepStrictEqual(response.error.data, data);
        });
    });

    describe('getErrorStats', () => {
        it('should return error statistics', () => {
            // Generate some errors
            errorHandler.handleError(new Error('connection refused'));
            errorHandler.handleError(new Error('invalid json'));
            errorHandler.handleError(new Error('timeout occurred'));

            const stats = errorHandler.getErrorStats();

            assert.strictEqual(stats.totalErrors, 3);
            assert.ok(stats.errorsByCategory);
            assert.ok(Array.isArray(stats.recentErrors));
            assert.ok(['good', 'fair', 'degraded', 'poor'].includes(stats.health));
        });
    });

    describe('calculateHealthScore', () => {
        it('should return "good" for no errors', () => {
            const score = errorHandler.calculateHealthScore();
            assert.strictEqual(score, 'good');
        });

        it('should return "poor" for critical errors', () => {
            errorHandler.errorCounts.set('BACKEND_CRASH', 1);
            const score = errorHandler.calculateHealthScore();
            assert.strictEqual(score, 'poor');
        });

        it('should return "degraded" for many errors', () => {
            errorHandler.errorCounts.set('CONNECTION_ERROR', 15);
            const score = errorHandler.calculateHealthScore();
            assert.strictEqual(score, 'degraded');
        });
    });
});

describe('RouterError', () => {
    it('should create error with code and details', () => {
        const error = new RouterError('Test message', 'TEST_CODE', { extra: 'info' });

        assert.strictEqual(error.message, 'Test message');
        assert.strictEqual(error.code, 'TEST_CODE');
        assert.deepStrictEqual(error.details, { extra: 'info' });
        assert.ok(error.timestamp);
        assert.strictEqual(error.name, 'RouterError');
    });

    it('should use default code when not provided', () => {
        const error = new RouterError('Test message');
        assert.strictEqual(error.code, 'ROUTER_ERROR');
    });
});

describe('CircuitBreaker', () => {
    let circuitBreaker;

    beforeEach(() => {
        circuitBreaker = new CircuitBreaker(3, 1000); // 3 failures, 1 second timeout
    });

    describe('constructor', () => {
        it('should initialize with default values', () => {
            const cb = new CircuitBreaker();
            assert.strictEqual(cb.failureThreshold, 5);
            assert.strictEqual(cb.timeout, 30000);
            assert.strictEqual(cb.state, 'CLOSED');
        });

        it('should initialize with custom values', () => {
            assert.strictEqual(circuitBreaker.failureThreshold, 3);
            assert.strictEqual(circuitBreaker.timeout, 1000);
        });
    });

    describe('execute', () => {
        it('should execute successful operations', async () => {
            const operation = () => Promise.resolve('success');
            const result = await circuitBreaker.execute(operation);

            assert.strictEqual(result, 'success');
            assert.strictEqual(circuitBreaker.state, 'CLOSED');
            assert.strictEqual(circuitBreaker.failureCount, 0);
        });

        it('should handle failed operations', async () => {
            const operation = () => Promise.reject(new Error('Operation failed'));

            await assert.rejects(
                circuitBreaker.execute(operation),
                { message: 'Operation failed' }
            );

            assert.strictEqual(circuitBreaker.failureCount, 1);
        });

        it('should open circuit after threshold failures', async () => {
            const operation = () => Promise.reject(new Error('Operation failed'));

            // Fail 3 times to reach threshold
            for (let i = 0; i < 3; i++) {
                await assert.rejects(circuitBreaker.execute(operation));
            }

            assert.strictEqual(circuitBreaker.state, 'OPEN');

            // Next call should be rejected immediately
            await assert.rejects(
                circuitBreaker.execute(operation),
                { code: 'CIRCUIT_BREAKER_OPEN' }
            );
        });

        it('should transition to half-open after timeout', async () => {
            const operation = () => Promise.reject(new Error('Operation failed'));

            // Open the circuit
            for (let i = 0; i < 3; i++) {
                await assert.rejects(circuitBreaker.execute(operation));
            }

            assert.strictEqual(circuitBreaker.state, 'OPEN');

            // Wait for timeout (simulate)
            circuitBreaker.lastFailureTime = Date.now() - 2000; // 2 seconds ago

            // Next operation should transition to half-open
            const successOperation = () => Promise.resolve('success');
            const result = await circuitBreaker.execute(successOperation);

            assert.strictEqual(result, 'success');
            assert.strictEqual(circuitBreaker.state, 'CLOSED');
            assert.strictEqual(circuitBreaker.failureCount, 0);
        });
    });

    describe('getStatus', () => {
        it('should return circuit breaker status', () => {
            const status = circuitBreaker.getStatus();

            assert.strictEqual(status.state, 'CLOSED');
            assert.strictEqual(status.failureCount, 0);
            assert.strictEqual(status.threshold, 3);
            assert.strictEqual(status.lastFailureTime, null);
        });
    });
});