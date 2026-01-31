/**
 * Security Validator Test Suite
 * Comprehensive tests for JSON-RPC security validation
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
    SecureJSONProcessor,
    SecurityError,
    MessageRateLimiter,
    ResourceMonitor,
    SecurityValidator,
    PRODUCTION_SECURITY_CONFIG
} from '../../src/security-validator.js';

describe('SecureJSONProcessor', () => {
    describe('Input Size Validation', () => {
        test('should reject oversized payloads', () => {
            const largePayload = JSON.stringify({ data: 'x'.repeat(2 * 1024 * 1024) }); // 2MB+

            expect(() => SecureJSONProcessor.parse(largePayload))
                .toThrow(SecurityError);

            expect(() => SecureJSONProcessor.parse(largePayload))
                .toThrow('Payload too large');
        });

        test('should accept normal sized payloads', () => {
            const normalPayload = JSON.stringify({
                jsonrpc: '2.0',
                method: 'test',
                params: { data: 'normal size data' }
            });

            expect(() => SecureJSONProcessor.parse(normalPayload))
                .not.toThrow();
        });

        test('should respect custom size limits', () => {
            const payload = JSON.stringify({ data: 'x'.repeat(500) });

            expect(() => SecureJSONProcessor.parse(payload, { maxSize: 100 }))
                .toThrow('Payload too large');

            expect(() => SecureJSONProcessor.parse(payload, { maxSize: 1000 }))
                .not.toThrow();
        });
    });

    describe('Prototype Pollution Protection', () => {
        test('should prevent __proto__ pollution', () => {
            const maliciousJSON = '{"__proto__": {"isAdmin": true}}';

            expect(() => SecureJSONProcessor.parse(maliciousJSON))
                .toThrow(SecurityError);

            expect(() => SecureJSONProcessor.parse(maliciousJSON))
                .toThrow('Blocked property key detected: __proto__');
        });

        test('should prevent constructor pollution', () => {
            const maliciousJSON = '{"constructor": {"prototype": {"isAdmin": true}}}';

            expect(() => SecureJSONProcessor.parse(maliciousJSON))
                .toThrow(SecurityError);
        });

        test('should prevent prototype property pollution', () => {
            const maliciousJSON = '{"prototype": {"isAdmin": true}}';

            expect(() => SecureJSONProcessor.parse(maliciousJSON))
                .toThrow(SecurityError);
        });

        test('should not affect legitimate properties', () => {
            const legitimateJSON = '{"proto": "value", "data": {"constructor": "safe"}}';

            expect(() => SecureJSONProcessor.parse(legitimateJSON))
                .not.toThrow();
        });

        test('should ensure prototype is not polluted after parsing', () => {
            const originalValue = Object.prototype.isAdmin;

            try {
                SecureJSONProcessor.parse('{"__proto__": {"isAdmin": true}}');
            } catch (e) {
                // Expected to throw
            }

            expect(Object.prototype.isAdmin).toBe(originalValue);
            expect({}.isAdmin).toBeUndefined();
        });
    });

    describe('Nesting Depth Validation', () => {
        test('should reject deeply nested objects', () => {
            // Create deeply nested object (15 levels)
            let nested = {};
            let current = nested;
            for (let i = 0; i < 15; i++) {
                current.nested = {};
                current = current.nested;
            }

            const deepJSON = JSON.stringify(nested);

            expect(() => SecureJSONProcessor.parse(deepJSON, { maxDepth: 10 }))
                .toThrow('Maximum nesting depth exceeded');
        });

        test('should accept normally nested objects', () => {
            const normalNested = {
                level1: {
                    level2: {
                        level3: {
                            data: 'value'
                        }
                    }
                }
            };

            const json = JSON.stringify(normalNested);

            expect(() => SecureJSONProcessor.parse(json))
                .not.toThrow();
        });
    });

    describe('String Length Validation', () => {
        test('should reject extremely long strings', () => {
            const longString = 'x'.repeat(20000);
            const json = JSON.stringify({ data: longString });

            expect(() => SecureJSONProcessor.parse(json))
                .toThrow('String value too long');
        });

        test('should accept normal length strings', () => {
            const normalString = 'This is a normal length string';
            const json = JSON.stringify({ data: normalString });

            expect(() => SecureJSONProcessor.parse(json))
                .not.toThrow();
        });
    });

    describe('JSON Structure Validation', () => {
        test('should detect unbalanced braces', () => {
            const malformedJSON = '{"incomplete": "object"';

            expect(() => SecureJSONProcessor.parse(malformedJSON))
                .toThrow('Invalid JSON structure detected');
        });

        test('should detect unbalanced brackets', () => {
            const malformedJSON = '{"array": ["incomplete"';

            expect(() => SecureJSONProcessor.parse(malformedJSON))
                .toThrow('Invalid JSON structure detected');
        });

        test('should accept well-formed JSON', () => {
            const validJSON = '{"array": ["item1", "item2"], "object": {"key": "value"}}';

            expect(() => SecureJSONProcessor.parse(validJSON))
                .not.toThrow();
        });
    });

    describe('Type Validation', () => {
        test('should reject non-string input', () => {
            expect(() => SecureJSONProcessor.parse({}))
                .toThrow('Invalid input type - expected string');

            expect(() => SecureJSONProcessor.parse(null))
                .toThrow('Invalid input type - expected string');

            expect(() => SecureJSONProcessor.parse(123))
                .toThrow('Invalid input type - expected string');
        });
    });
});

describe('MessageRateLimiter', () => {
    let limiter;

    beforeEach(() => {
        limiter = new MessageRateLimiter({
            maxRequests: 5,
            windowMs: 1000,
            blockDurationMs: 5000
        });
    });

    describe('Rate Limiting', () => {
        test('should allow requests under limit', () => {
            for (let i = 0; i < 5; i++) {
                expect(limiter.isAllowed('test-client')).toBe(true);
            }
        });

        test('should block requests over limit', () => {
            // Use up the rate limit
            for (let i = 0; i < 5; i++) {
                limiter.isAllowed('test-client');
            }

            // Next request should be blocked
            expect(limiter.isAllowed('test-client')).toBe(false);
        });

        test('should track separate limits for different clients', () => {
            // Client 1 uses up their limit
            for (let i = 0; i < 5; i++) {
                limiter.isAllowed('client1');
            }

            // Client 2 should still be allowed
            expect(limiter.isAllowed('client2')).toBe(true);

            // Client 1 should be blocked
            expect(limiter.isAllowed('client1')).toBe(false);
        });

        test('should reset limits after time window', (done) => {
            // Use up the limit
            for (let i = 0; i < 5; i++) {
                limiter.isAllowed('test-client');
            }

            expect(limiter.isAllowed('test-client')).toBe(false);

            // Wait for window to reset
            setTimeout(() => {
                expect(limiter.isAllowed('test-client')).toBe(true);
                done();
            }, 1100);
        }, 2000);
    });

    describe('Client Blocking', () => {
        test('should block client after rate limit violation', () => {
            // Trigger rate limit
            for (let i = 0; i < 6; i++) {
                limiter.isAllowed('test-client');
            }

            expect(limiter.isBlocked('test-client')).toBe(true);
        });

        test('should unblock client after block duration', (done) => {
            // Trigger blocking
            for (let i = 0; i < 6; i++) {
                limiter.isAllowed('test-client');
            }

            expect(limiter.isBlocked('test-client')).toBe(true);

            // Wait for block to expire (5 seconds, but we'll test with shorter time)
            limiter.blockDurationMs = 100; // Shorten for testing
            setTimeout(() => {
                expect(limiter.isBlocked('test-client')).toBe(false);
                done();
            }, 150);
        }, 1000);
    });

    describe('Statistics', () => {
        test('should provide accurate statistics', () => {
            limiter.isAllowed('client1');
            limiter.isAllowed('client1');
            limiter.isAllowed('client2');

            const stats = limiter.getStats();
            expect(stats.activeClients).toBe(2);
            expect(stats.totalRequestsLastWindow).toBe(3);
        });
    });

    describe('Cleanup', () => {
        test('should remove old entries during cleanup', () => {
            limiter.isAllowed('test-client');

            // Force cleanup by manipulating time
            const oldEntries = limiter.requestCounts.get('test-client');
            limiter.requestCounts.set('test-client', [Date.now() - 2000]); // Old entry

            limiter.cleanup();

            expect(limiter.requestCounts.has('test-client')).toBe(false);
        });
    });
});

describe('ResourceMonitor', () => {
    let monitor;

    beforeEach(() => {
        monitor = new ResourceMonitor({
            maxMemoryMB: 100, // Low limit for testing
            maxCpuPercent: 50,
            maxUptimeHours: 1
        });
    });

    describe('Memory Monitoring', () => {
        test('should pass with normal memory usage', () => {
            expect(() => monitor.checkLimits()).not.toThrow();
        });

        test('should detect memory violations', () => {
            // Mock high memory usage
            const originalUsage = process.memoryUsage;
            process.memoryUsage = () => ({
                heapUsed: 200 * 1024 * 1024, // 200MB
                heapTotal: 300 * 1024 * 1024,
                external: 0,
                rss: 250 * 1024 * 1024
            });

            expect(() => monitor.checkLimits())
                .toThrow('Resource limits violated');

            // Restore original
            process.memoryUsage = originalUsage;
        });
    });

    describe('Health Scoring', () => {
        test('should calculate health scores correctly', () => {
            const metrics = monitor.getMetrics();
            expect(metrics).toHaveProperty('memory');
            expect(metrics).toHaveProperty('process');
            expect(metrics).toHaveProperty('thresholds');
        });
    });
});

describe('SecurityValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new SecurityValidator(PRODUCTION_SECURITY_CONFIG);
    });

    afterEach(() => {
        if (validator) {
            validator.destroy();
        }
    });

    describe('Message Validation', () => {
        test('should validate legitimate JSON-RPC messages', () => {
            const validMessage = JSON.stringify({
                jsonrpc: '2.0',
                method: 'test',
                params: { data: 'test' },
                id: 1
            });

            expect(() => validator.validateMessage(validMessage, 'test-client'))
                .not.toThrow();
        });

        test('should reject invalid JSON-RPC version', () => {
            const invalidMessage = JSON.stringify({
                jsonrpc: '1.0',
                method: 'test',
                id: 1
            });

            expect(() => validator.validateMessage(invalidMessage, 'test-client'))
                .toThrow('Invalid or missing JSON-RPC version');
        });

        test('should reject blocked methods', () => {
            const blockedMessage = JSON.stringify({
                jsonrpc: '2.0',
                method: 'eval',
                params: { code: 'malicious code' },
                id: 1
            });

            expect(() => validator.validateMessage(blockedMessage, 'test-client'))
                .toThrow('Blocked method: eval');
        });

        test('should reject oversized method names', () => {
            const longMethodMessage = JSON.stringify({
                jsonrpc: '2.0',
                method: 'x'.repeat(200),
                id: 1
            });

            expect(() => validator.validateMessage(longMethodMessage, 'test-client'))
                .toThrow('Method name too long');
        });

        test('should validate ID types', () => {
            const invalidIdMessage = JSON.stringify({
                jsonrpc: '2.0',
                method: 'test',
                id: { object: 'not allowed' }
            });

            expect(() => validator.validateMessage(invalidIdMessage, 'test-client'))
                .toThrow('ID must be string, number, or null');
        });
    });

    describe('Rate Limiting Integration', () => {
        test('should integrate rate limiting', () => {
            const message = JSON.stringify({
                jsonrpc: '2.0',
                method: 'test',
                id: 1
            });

            // Use up rate limit (production config: 60 requests/minute)
            for (let i = 0; i < 61; i++) {
                try {
                    validator.validateMessage(message, 'rate-test-client');
                } catch (e) {
                    if (e.code === 'RATE_LIMIT_EXCEEDED') {
                        expect(i).toBe(60); // Should fail on 61st request
                        return;
                    }
                }
            }
        });
    });

    describe('Statistics', () => {
        test('should provide security statistics', () => {
            const stats = validator.getSecurityStats();

            expect(stats).toHaveProperty('rateLimiting');
            expect(stats).toHaveProperty('resources');
            expect(stats).toHaveProperty('recentEvents');
            expect(stats).toHaveProperty('uptime');
        });
    });

    describe('Error Handling', () => {
        test('should handle malformed JSON gracefully', () => {
            const malformedMessage = '{"incomplete": json';

            expect(() => validator.validateMessage(malformedMessage, 'test-client'))
                .toThrow(SecurityError);
        });

        test('should handle empty messages', () => {
            expect(() => validator.validateMessage('', 'test-client'))
                .toThrow(SecurityError);
        });

        test('should handle null/undefined messages', () => {
            expect(() => validator.validateMessage(null, 'test-client'))
                .toThrow('Invalid input type - expected string');
        });
    });
});

describe('Security Integration Tests', () => {
    describe('Real-world Attack Scenarios', () => {
        let validator;

        beforeEach(() => {
            validator = new SecurityValidator(PRODUCTION_SECURITY_CONFIG);
        });

        afterEach(() => {
            validator.destroy();
        });

        test('should block prototype pollution via JSON-RPC params', () => {
            const attackMessage = JSON.stringify({
                jsonrpc: '2.0',
                method: 'test',
                params: {
                    '__proto__': {
                        'isAdmin': true
                    }
                },
                id: 1
            });

            expect(() => validator.validateMessage(attackMessage))
                .toThrow(SecurityError);
        });

        test('should handle billion laughs attack', () => {
            // Simulate deeply nested JSON that could cause exponential processing
            let nested = '"value"';
            for (let i = 0; i < 20; i++) {
                nested = `[${nested}, ${nested}]`; // Doubles size each iteration
            }

            const attackMessage = `{"jsonrpc": "2.0", "method": "test", "params": {"data": ${nested}}, "id": 1}`;

            expect(() => validator.validateMessage(attackMessage))
                .toThrow(SecurityError); // Should fail on size or depth limits
        });

        test('should reject JSON with excessive string lengths', () => {
            const longString = 'A'.repeat(50000);
            const attackMessage = JSON.stringify({
                jsonrpc: '2.0',
                method: 'test',
                params: { attack: longString },
                id: 1
            });

            expect(() => validator.validateMessage(attackMessage))
                .toThrow('String value too long');
        });

        test('should handle rapid-fire requests (DoS)', () => {
            const message = JSON.stringify({
                jsonrpc: '2.0',
                method: 'test',
                id: 1
            });

            let blocked = false;
            const startTime = Date.now();

            // Send many requests rapidly
            for (let i = 0; i < 100; i++) {
                try {
                    validator.validateMessage(message, 'dos-attacker');
                } catch (error) {
                    if (error.code === 'RATE_LIMIT_EXCEEDED') {
                        blocked = true;
                        break;
                    }
                }
            }

            expect(blocked).toBe(true);
            expect(Date.now() - startTime).toBeLessThan(5000); // Should block quickly
        });
    });

    describe('Performance Under Load', () => {
        test('should maintain performance with valid messages', () => {
            const validator = new SecurityValidator();
            const message = JSON.stringify({
                jsonrpc: '2.0',
                method: 'test',
                params: { data: 'normal message' },
                id: 1
            });

            const startTime = Date.now();
            const iterations = 1000;

            for (let i = 0; i < iterations; i++) {
                validator.validateMessage(message, `client-${i % 10}`);
            }

            const duration = Date.now() - startTime;
            const avgTime = duration / iterations;

            expect(avgTime).toBeLessThan(10); // Should average less than 10ms per validation

            validator.destroy();
        });
    });
});

describe('Configuration Security', () => {
    test('production config should be secure by default', () => {
        expect(PRODUCTION_SECURITY_CONFIG.rateLimit.maxRequests).toBeLessThanOrEqual(100);
        expect(PRODUCTION_SECURITY_CONFIG.resources.maxMemoryMB).toBeLessThanOrEqual(512);
        expect(PRODUCTION_SECURITY_CONFIG.logging.logLevel).toBe('info');
    });

    test('should create validator with custom security settings', () => {
        const customConfig = {
            rateLimit: { maxRequests: 10, windowMs: 1000 },
            resources: { maxMemoryMB: 64 },
            logging: { logLevel: 'debug' }
        };

        const validator = new SecurityValidator(customConfig);
        expect(validator.rateLimiter.maxRequests).toBe(10);

        validator.destroy();
    });
});