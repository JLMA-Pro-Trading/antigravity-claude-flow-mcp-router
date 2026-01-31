/**
 * Unit Tests for Config Validator
 * Addresses AQE findings: comprehensive validation testing
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ConfigValidator, validateConfig } from '../../src/config-validator.js';
import { RouterError } from '../../src/error-handler.js';

describe('ConfigValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new ConfigValidator();
    });

    describe('constructor', () => {
        it('should initialize with required and optional fields', () => {
            assert.ok(Array.isArray(validator.requiredFields));
            assert.ok(Array.isArray(validator.optionalFields));
            assert.ok(validator.toolSchema);
        });
    });

    describe('validate', () => {
        it('should validate minimal valid configuration', () => {
            const config = {
                name: 'test-config',
                backendCommand: 'node',
                backendArgs: ['test.js'],
                routerTools: [{
                    name: 'test_tool',
                    description: 'Test tool',
                    inputSchema: { type: 'object' }
                }]
            };

            const result = validator.validate(config);
            assert.ok(result);
            assert.strictEqual(result.name, 'test-config');
        });

        it('should throw error for non-object config', () => {
            assert.throws(() => {
                validator.validate(null);
            }, RouterError);

            assert.throws(() => {
                validator.validate('not an object');
            }, RouterError);
        });

        it('should throw error for missing required fields', () => {
            const config = {
                name: 'test'
                // Missing other required fields
            };

            assert.throws(() => {
                validator.validate(config);
            }, {
                name: 'RouterError',
                code: 'CONFIG_VALIDATION_FAILED'
            });
        });

        it('should normalize configuration with defaults', () => {
            const config = {
                name: 'test-config',
                backendCommand: 'node',
                backendArgs: ['test.js'],
                routerTools: [{
                    name: 'test_tool',
                    description: 'Test tool',
                    inputSchema: { type: 'object' }
                }]
            };

            const result = validator.validate(config);

            // Should add default description
            assert.ok(result.description.includes('test-config'));
            // Should add default mapToRealTool function
            assert.strictEqual(typeof result.mapToRealTool, 'function');
        });
    });

    describe('validateName', () => {
        it('should accept valid names', () => {
            const validNames = ['test', 'test-config', 'test_config', 'config123'];

            validNames.forEach(name => {
                const errors = validator.validateName(name);
                assert.strictEqual(errors.length, 0, `Name "${name}" should be valid`);
            });
        });

        it('should reject invalid names', () => {
            const testCases = [
                { name: '', expectedError: 'name cannot be empty' },
                { name: 123, expectedError: 'name must be a string' },
                { name: 'invalid name with spaces', expectedError: 'name can only contain' },
                { name: 'invalid@name', expectedError: 'name can only contain' },
                { name: 'a'.repeat(51), expectedError: 'name cannot exceed 50 characters' }
            ];

            testCases.forEach(({ name, expectedError }) => {
                const errors = validator.validateName(name);
                assert.ok(errors.length > 0, `Name "${name}" should be invalid`);
                assert.ok(errors.some(error => error.includes(expectedError)),
                    `Expected error containing "${expectedError}" for name "${name}"`);
            });
        });
    });

    describe('validateBackendCommand', () => {
        it('should accept valid commands', () => {
            const validCommands = ['node', 'python', '/usr/bin/node', './script.sh'];

            validCommands.forEach(command => {
                const errors = validator.validateBackendCommand(command);
                assert.strictEqual(errors.length, 0, `Command "${command}" should be valid`);
            });
        });

        it('should reject invalid commands', () => {
            const testCases = [
                { command: '', expectedError: 'cannot be empty' },
                { command: 123, expectedError: 'must be a string' },
                { command: null, expectedError: 'must be a string' }
            ];

            testCases.forEach(({ command, expectedError }) => {
                const errors = validator.validateBackendCommand(command);
                assert.ok(errors.length > 0, `Command "${command}" should be invalid`);
                assert.ok(errors.some(error => error.includes(expectedError)));
            });
        });
    });

    describe('validateBackendArgs', () => {
        it('should accept valid arguments', () => {
            const validArgs = [
                [],
                ['--help'],
                ['start', '--port', '3000'],
                ['--config', '/path/to/config']
            ];

            validArgs.forEach(args => {
                const errors = validator.validateBackendArgs(args);
                assert.strictEqual(errors.length, 0, `Args ${JSON.stringify(args)} should be valid`);
            });
        });

        it('should reject invalid arguments', () => {
            const testCases = [
                { args: 'not an array', expectedError: 'must be an array' },
                { args: [123, 'valid'], expectedError: 'must be a string' },
                { args: ['valid', null], expectedError: 'must be a string' }
            ];

            testCases.forEach(({ args, expectedError }) => {
                const errors = validator.validateBackendArgs(args);
                assert.ok(errors.length > 0, `Args ${JSON.stringify(args)} should be invalid`);
                assert.ok(errors.some(error => error.includes(expectedError)));
            });
        });
    });

    describe('validateRouterTools', () => {
        it('should accept valid tools array', () => {
            const validTools = [{
                name: 'test_tool',
                description: 'Test tool',
                inputSchema: { type: 'object', properties: {} }
            }];

            const errors = validator.validateRouterTools(validTools);
            assert.strictEqual(errors.length, 0);
        });

        it('should reject invalid tools array', () => {
            const testCases = [
                { tools: 'not an array', expectedError: 'must be an array' },
                { tools: [], expectedError: 'cannot be empty' },
                { tools: [{ name: 'test' }], expectedError: 'missing required field: description' },
                { tools: [
                    { name: 'tool1', description: 'Tool 1', inputSchema: {} },
                    { name: 'tool1', description: 'Tool 1 duplicate', inputSchema: {} }
                ], expectedError: 'Duplicate tool names' }
            ];

            testCases.forEach(({ tools, expectedError }) => {
                const errors = validator.validateRouterTools(tools);
                assert.ok(errors.length > 0, `Tools should be invalid`);
                assert.ok(errors.some(error => error.includes(expectedError)));
            });
        });
    });

    describe('validateTool', () => {
        it('should validate individual tool correctly', () => {
            const validTool = {
                name: 'valid_tool',
                description: 'A valid tool',
                inputSchema: { type: 'object' }
            };

            const errors = validator.validateTool(validTool, 0);
            assert.strictEqual(errors.length, 0);
        });

        it('should reject invalid tool properties', () => {
            const testCases = [
                { tool: null, expectedError: 'must be an object' },
                { tool: { name: '', description: 'test', inputSchema: {} }, expectedError: 'name cannot be empty' },
                { tool: { name: 'invalid name!', description: 'test', inputSchema: {} }, expectedError: 'invalid characters' },
                { tool: { name: 'test' }, expectedError: 'missing required field: description' },
                { tool: { name: 'test', description: 123, inputSchema: {} }, expectedError: 'description must be of type string' }
            ];

            testCases.forEach(({ tool, expectedError }) => {
                const errors = validator.validateTool(tool, 0);
                assert.ok(errors.length > 0, `Tool should be invalid`);
                assert.ok(errors.some(error => error.includes(expectedError)),
                    `Expected error containing "${expectedError}"`);
            });
        });
    });

    describe('validateMapToRealTool', () => {
        it('should accept valid mapping function', () => {
            const validFunction = (tool, action) => `${tool}_${action}`;
            const errors = validator.validateMapToRealTool(validFunction);
            assert.strictEqual(errors.length, 0);
        });

        it('should accept null/undefined', () => {
            const errors1 = validator.validateMapToRealTool(null);
            const errors2 = validator.validateMapToRealTool(undefined);
            assert.strictEqual(errors1.length, 0);
            assert.strictEqual(errors2.length, 0);
        });

        it('should reject invalid mapping function', () => {
            const testCases = [
                { fn: 'not a function', expectedError: 'must be a function' },
                { fn: () => 123, expectedError: 'must return a string' },
                { fn: () => { throw new Error('test error'); }, expectedError: 'function error' }
            ];

            testCases.forEach(({ fn, expectedError }) => {
                const errors = validator.validateMapToRealTool(fn);
                assert.ok(errors.length > 0, `Function should be invalid`);
                assert.ok(errors.some(error => error.includes(expectedError)));
            });
        });
    });

    describe('isValidToolName', () => {
        it('should validate tool names correctly', () => {
            const validNames = ['tool', 'tool_name', 'tool-name', 'tool123', 'myTool'];
            const invalidNames = ['', '123tool', 'tool name', 'tool@name', 'a'.repeat(65)];

            validNames.forEach(name => {
                assert.ok(validator.isValidToolName(name), `"${name}" should be valid`);
            });

            invalidNames.forEach(name => {
                assert.ok(!validator.isValidToolName(name), `"${name}" should be invalid`);
            });
        });
    });

    describe('getConfigSummary', () => {
        it('should create configuration summary', () => {
            const config = {
                name: 'test-config',
                description: 'Test configuration',
                backendCommand: 'node',
                backendArgs: ['test.js'],
                routerTools: [{ name: 'tool1' }, { name: 'tool2' }],
                mapToRealTool: (tool, action) => tool,
                features: { feature1: true, feature2: false }
            };

            const summary = validator.getConfigSummary(config);

            assert.strictEqual(summary.name, 'test-config');
            assert.strictEqual(summary.description, 'Test configuration');
            assert.strictEqual(summary.backend, 'node test.js');
            assert.strictEqual(summary.toolCount, 2);
            assert.strictEqual(summary.hasMapping, true);
            assert.deepStrictEqual(summary.features, ['feature1', 'feature2']);
            assert.ok(summary.size > 0);
        });
    });

    describe('createMinimalConfig', () => {
        it('should create minimal valid configuration', () => {
            const config = validator.createMinimalConfig('minimal-test');

            // Should validate without errors
            const result = validator.validate(config);
            assert.ok(result);
            assert.strictEqual(result.name, 'minimal-test');
        });

        it('should create with default name', () => {
            const config = validator.createMinimalConfig();
            assert.strictEqual(config.name, 'test');
        });
    });
});

describe('validateConfig', () => {
    it('should validate configuration using convenience function', () => {
        const validConfig = {
            name: 'test-config',
            backendCommand: 'node',
            backendArgs: ['script.js'],
            routerTools: [{
                name: 'test_tool',
                description: 'Test tool',
                inputSchema: { type: 'object' }
            }]
        };

        const result = validateConfig(validConfig);
        assert.ok(result);
        assert.strictEqual(result.name, 'test-config');
    });

    it('should throw RouterError for invalid configuration', () => {
        const invalidConfig = { name: 'incomplete' };

        assert.throws(() => {
            validateConfig(invalidConfig);
        }, RouterError);
    });
});