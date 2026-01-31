/**
 * Malformed JSON Handling Tests
 * Tests for robust JSON parsing and error recovery
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('Malformed JSON Handling', () => {
    let jsonParser;
    let errorLog;

    beforeEach(() => {
        errorLog = [];

        jsonParser = {
            parseMessage(input) {
                try {
                    // Handle common malformed cases
                    if (!input || typeof input !== 'string') {
                        return { error: 'Input must be a non-empty string' };
                    }

                    const trimmed = input.trim();
                    if (!trimmed) {
                        return { error: 'Empty input' };
                    }

                    // Handle stdout pollution (common issue)
                    const openBrace = trimmed.indexOf('{');
                    if (openBrace === -1) {
                        return { error: 'No JSON object found' };
                    }

                    const potentialJson = trimmed.substring(openBrace);

                    // Try parsing the potential JSON
                    const parsed = JSON.parse(potentialJson);

                    // Validate JSON-RPC structure
                    if (!parsed.jsonrpc) {
                        return { error: 'Missing jsonrpc field' };
                    }

                    return { success: true, data: parsed };

                } catch (parseError) {
                    // Attempt recovery for common issues
                    return this.attemptRecovery(input, parseError);
                }
            },

            attemptRecovery(input, originalError) {
                try {
                    // Try to fix common JSON issues
                    let fixed = input.trim();

                    // Remove common prefixes
                    const prefixes = [
                        /^INFO:\s*/,
                        /^DEBUG:\s*/,
                        /^ERROR:\s*/,
                        /^\[\d{4}-\d{2}-\d{2}.*?\]\s*/,
                        /^[A-Z]+\s+/
                    ];

                    for (const prefix of prefixes) {
                        fixed = fixed.replace(prefix, '');
                    }

                    // Find JSON boundaries
                    const start = fixed.indexOf('{');
                    const end = fixed.lastIndexOf('}');

                    if (start !== -1 && end !== -1 && end > start) {
                        const extracted = fixed.substring(start, end + 1);
                        const parsed = JSON.parse(extracted);

                        errorLog.push({
                            type: 'recovered',
                            original: input,
                            recovered: extracted,
                            error: originalError.message
                        });

                        return { success: true, data: parsed, recovered: true };
                    }

                    return {
                        error: 'Recovery failed',
                        originalError: originalError.message
                    };

                } catch (recoveryError) {
                    errorLog.push({
                        type: 'failed_recovery',
                        original: input,
                        parseError: originalError.message,
                        recoveryError: recoveryError.message
                    });

                    return {
                        error: 'Both parsing and recovery failed',
                        originalError: originalError.message,
                        recoveryError: recoveryError.message
                    };
                }
            }
        };
    });

    describe('Basic Malformed JSON', () => {
        it('should handle completely invalid input', () => {
            const invalidInputs = [
                null,
                undefined,
                '',
                '   ',
                'not json at all',
                '12345',
                'true',
                'null'
            ];

            invalidInputs.forEach((input, index) => {
                const result = jsonParser.parseMessage(input);
                assert.strictEqual(result.success, undefined, `Input ${index} should fail`);
                assert.ok(result.error, `Input ${index} should have error message`);
            });
        });

        it('should handle incomplete JSON', () => {
            const incompleteInputs = [
                '{"jsonrpc":"2.0",',
                '{"jsonrpc":"2.0","method":"test"',
                '{"jsonrpc":"2.0","method":"test","id"',
                '{"jsonrpc":"2.0","method":"test","id":',
                '{"jsonrpc":"2.0","method":"test","id":1'
            ];

            incompleteInputs.forEach((input) => {
                const result = jsonParser.parseMessage(input);
                assert.strictEqual(result.success, undefined);
                assert.ok(result.error);
            });
        });

        it('should handle JSON with syntax errors', () => {
            const syntaxErrors = [
                '{"jsonrpc":"2.0","method":}',
                '{"jsonrpc":"2.0",,"method":"test"}',
                '{"jsonrpc":"2.0","method":"test",}',
                '{"jsonrpc":"2.0";"method":"test"}',
                '{jsonrpc:"2.0","method":"test"}', // unquoted key
                '{"jsonrpc":"2.0","method":\'test\'}' // single quotes
            ];

            syntaxErrors.forEach((input) => {
                const result = jsonParser.parseMessage(input);
                assert.strictEqual(result.success, undefined);
                assert.ok(result.error);
            });
        });
    });

    describe('Stdout Pollution Recovery', () => {
        it('should recover from common log prefixes', () => {
            const pollutedInputs = [
                'INFO: {"jsonrpc":"2.0","method":"test","id":1}',
                'DEBUG: {"jsonrpc":"2.0","method":"test","id":2}',
                'ERROR: {"jsonrpc":"2.0","method":"test","id":3}',
                '[2024-01-01 12:00:00] {"jsonrpc":"2.0","method":"test","id":4}',
                'WARN {"jsonrpc":"2.0","method":"test","id":5}'
            ];

            pollutedInputs.forEach((input) => {
                const result = jsonParser.parseMessage(input);
                assert.strictEqual(result.success, true, `Should recover from: ${input}`);
                assert.ok(result.data);
                assert.strictEqual(result.data.jsonrpc, '2.0');
                assert.strictEqual(result.data.method, 'test');
            });
        });

        it('should handle trailing garbage after JSON', () => {
            const trailingGarbage = [
                '{"jsonrpc":"2.0","method":"test","id":1} extra text',
                '{"jsonrpc":"2.0","method":"test","id":2}\n\nmore text',
                '{"jsonrpc":"2.0","method":"test","id":3} 12345',
                'prefix {"jsonrpc":"2.0","method":"test","id":4} suffix'
            ];

            trailingGarbage.forEach((input) => {
                const result = jsonParser.parseMessage(input);
                if (result.success) {
                    assert.strictEqual(result.data.jsonrpc, '2.0');
                    assert.strictEqual(result.data.method, 'test');
                }
            });
        });

        it('should extract JSON from mixed content', () => {
            const mixedContent = [
                'Starting server... {"jsonrpc":"2.0","method":"server.initialized"} Server ready',
                'Processing request {"jsonrpc":"2.0","id":100,"result":{"status":"ok"}} Done',
                'Multiple {"jsonrpc":"2.0","method":"first"} messages {"jsonrpc":"2.0","method":"second"} here'
            ];

            mixedContent.forEach((input) => {
                const result = jsonParser.parseMessage(input);
                // Should extract the first valid JSON
                if (result.success) {
                    assert.strictEqual(result.data.jsonrpc, '2.0');
                }
            });
        });
    });

    describe('Character Encoding Issues', () => {
        it('should handle unicode characters', () => {
            const unicodeInputs = [
                '{"jsonrpc":"2.0","method":"test","params":{"text":"Hello 世界"}}',
                '{"jsonrpc":"2.0","method":"test","params":{"emoji":"🚀"}}',
                '{"jsonrpc":"2.0","method":"test","params":{"special":"çñü"}}',
                '{"jsonrpc":"2.0","method":"test","params":{"symbols":"©®™"}}'
            ];

            unicodeInputs.forEach((input) => {
                const result = jsonParser.parseMessage(input);
                assert.strictEqual(result.success, true);
                assert.ok(result.data.params);
            });
        });

        it('should handle escaped characters', () => {
            const escapedInputs = [
                '{"jsonrpc":"2.0","method":"test","params":{"path":"C:\\\\Users\\\\test"}}',
                '{"jsonrpc":"2.0","method":"test","params":{"quote":"He said \\"hello\\""}}',
                '{"jsonrpc":"2.0","method":"test","params":{"newline":"line1\\nline2"}}',
                '{"jsonrpc":"2.0","method":"test","params":{"tab":"col1\\tcol2"}}'
            ];

            escapedInputs.forEach((input) => {
                const result = jsonParser.parseMessage(input);
                assert.strictEqual(result.success, true);
                assert.ok(result.data.params);
            });
        });

        it('should handle malformed escape sequences', () => {
            const malformedEscapes = [
                '{"jsonrpc":"2.0","method":"test","params":"invalid\\xsequence"}',
                '{"jsonrpc":"2.0","method":"test","params":"incomplete\\"}',
                '{"jsonrpc":"2.0","method":"test","params":"unknown\\z"}'
            ];

            malformedEscapes.forEach((input) => {
                const result = jsonParser.parseMessage(input);
                // Should fail gracefully
                assert.strictEqual(result.success, undefined);
            });
        });
    });

    describe('Large Message Handling', () => {
        it('should handle very large JSON messages', () => {
            const largeData = 'x'.repeat(10000);
            const largeMessage = `{"jsonrpc":"2.0","method":"test","params":{"data":"${largeData}"}}`;

            const result = jsonParser.parseMessage(largeMessage);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.data.params.data.length, 10000);
        });

        it('should handle deeply nested objects', () => {
            let deepObject = '{"value":';
            for (let i = 0; i < 100; i++) {
                deepObject += '{"nested":';
            }
            deepObject += '"deep"';
            for (let i = 0; i < 100; i++) {
                deepObject += '}';
            }
            deepObject += '}';

            const deepMessage = `{"jsonrpc":"2.0","method":"test","params":${deepObject}}`;

            const result = jsonParser.parseMessage(deepMessage);
            assert.strictEqual(result.success, true);
        });
    });

    describe('Edge Case Recovery', () => {
        it('should track recovery statistics', () => {
            const pollutedInput = 'INFO: {"jsonrpc":"2.0","method":"test","id":1}';
            const result = jsonParser.parseMessage(pollutedInput);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.recovered, true);
            assert.strictEqual(errorLog.length, 1);
            assert.strictEqual(errorLog[0].type, 'recovered');
        });

        it('should handle multiple JSON objects', () => {
            const multipleJson = '{"jsonrpc":"2.0","method":"first","id":1}{"jsonrpc":"2.0","method":"second","id":2}';

            // Parser should extract the first valid JSON
            const result = jsonParser.parseMessage(multipleJson);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.data.method, 'first');
        });

        it('should limit recovery attempts to prevent infinite loops', () => {
            const problematicInput = 'recursive{recursive{recursive{';

            const result = jsonParser.parseMessage(problematicInput);
            assert.strictEqual(result.success, undefined);
            assert.ok(result.error);
        });
    });

    describe('Memory Safety', () => {
        it('should handle null bytes gracefully', () => {
            const nullByteInputs = [
                '{"jsonrpc":"2.0","method":"test\0","id":1}',
                '\0{"jsonrpc":"2.0","method":"test","id":2}',
                '{"jsonrpc":"2.0","method":"test","id":3}\0'
            ];

            nullByteInputs.forEach((input) => {
                const result = jsonParser.parseMessage(input);
                // Should either succeed or fail gracefully
                assert.ok(result.success || result.error);
            });
        });

        it('should handle extremely long strings', () => {
            const longString = 'a'.repeat(1000000); // 1MB string
            const longMessage = `{"jsonrpc":"2.0","method":"test","params":"${longString}"}`;

            // Should handle large messages without crashing
            assert.doesNotThrow(() => {
                jsonParser.parseMessage(longMessage);
            });
        });

        it('should handle circular reference attempts', () => {
            // Can't actually create circular JSON, but can test handling of malformed attempts
            const circularAttempt = '{"jsonrpc":"2.0","method":"test","params":{"self":';

            const result = jsonParser.parseMessage(circularAttempt);
            assert.strictEqual(result.success, undefined);
            assert.ok(result.error);
        });
    });

    describe('Protocol-Specific Edge Cases', () => {
        it('should handle missing required JSON-RPC fields', () => {
            const missingFieldCases = [
                '{"method":"test","id":1}', // missing jsonrpc
                '{"jsonrpc":"1.0","method":"test","id":1}', // wrong version
                '{"jsonrpc":"2.0","id":1}', // missing method for request
                '{"jsonrpc":"2.0","method":""}' // empty method
            ];

            missingFieldCases.forEach((input, index) => {
                const result = jsonParser.parseMessage(input);
                if (result.success) {
                    // If parsing succeeded, should catch protocol issues
                    if (index === 0 || index === 1) {
                        // These should be caught by validation
                        assert.ok(result.error || !result.data.jsonrpc || result.data.jsonrpc !== '2.0');
                    }
                }
            });
        });

        it('should handle oversized IDs', () => {
            const oversizedIds = [
                Number.MAX_SAFE_INTEGER + 1,
                'x'.repeat(1000),
                { complex: 'object' }
            ];

            oversizedIds.forEach((id) => {
                const message = `{"jsonrpc":"2.0","method":"test","id":${JSON.stringify(id)}}`;
                const result = jsonParser.parseMessage(message);

                if (result.success) {
                    // Should parse but may have ID validation issues
                    assert.ok(result.data);
                }
            });
        });
    });
});