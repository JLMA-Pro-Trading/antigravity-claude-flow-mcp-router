/**
 * Configuration Validator
 * Addresses AQE findings: reduced complexity, improved validation
 */

import { RouterError } from './error-handler.js';

export class ConfigValidator {
    constructor() {
        this.requiredFields = [
            'name',
            'backendCommand',
            'backendArgs',
            'routerTools'
        ];

        this.optionalFields = [
            'mapToRealTool',
            'description',
            'middleware',
            'features',
            'optimizations'
        ];

        this.toolSchema = {
            name: { type: 'string', required: true },
            description: { type: 'string', required: true },
            inputSchema: { type: 'object', required: true }
        };
    }

    /**
     * Validate complete configuration
     */
    validate(config) {
        const errors = [];

        // Validate basic structure
        if (!config || typeof config !== 'object') {
            throw new RouterError('Configuration must be an object', 'INVALID_CONFIG');
        }

        // Check required fields
        for (const field of this.requiredFields) {
            const error = this.validateField(config, field);
            if (error) errors.push(error);
        }

        // Validate specific field types
        errors.push(...this.validateName(config.name));
        errors.push(...this.validateBackendCommand(config.backendCommand));
        errors.push(...this.validateBackendArgs(config.backendArgs));
        errors.push(...this.validateRouterTools(config.routerTools));
        errors.push(...this.validateMapToRealTool(config.mapToRealTool));

        // Filter out null/undefined errors
        const validErrors = errors.filter(Boolean);

        if (validErrors.length > 0) {
            throw new RouterError(
                `Configuration validation failed: ${validErrors.join(', ')}`,
                'CONFIG_VALIDATION_FAILED',
                { errors: validErrors }
            );
        }

        return this.normalizeConfig(config);
    }

    /**
     * Validate individual field exists
     */
    validateField(config, fieldName) {
        if (!(fieldName in config) || config[fieldName] === null || config[fieldName] === undefined) {
            return `Missing required field: ${fieldName}`;
        }
        return null;
    }

    /**
     * Validate configuration name
     */
    validateName(name) {
        const errors = [];

        if (typeof name !== 'string') {
            errors.push('name must be a string');
        } else {
            if (name.length === 0) {
                errors.push('name cannot be empty');
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
                errors.push('name can only contain alphanumeric characters, dashes, and underscores');
            }
            if (name.length > 50) {
                errors.push('name cannot exceed 50 characters');
            }
        }

        return errors;
    }

    /**
     * Validate backend command
     */
    validateBackendCommand(command) {
        const errors = [];

        if (typeof command !== 'string') {
            errors.push('backendCommand must be a string');
        } else if (command.length === 0) {
            errors.push('backendCommand cannot be empty');
        }

        return errors;
    }

    /**
     * Validate backend arguments
     */
    validateBackendArgs(args) {
        const errors = [];

        if (!Array.isArray(args)) {
            errors.push('backendArgs must be an array');
        } else {
            args.forEach((arg, index) => {
                if (typeof arg !== 'string') {
                    errors.push(`backendArgs[${index}] must be a string`);
                }
            });
        }

        return errors;
    }

    /**
     * Validate router tools
     */
    validateRouterTools(tools) {
        const errors = [];

        if (!Array.isArray(tools)) {
            errors.push('routerTools must be an array');
            return errors;
        }

        if (tools.length === 0) {
            errors.push('routerTools cannot be empty');
            return errors;
        }

        // Validate each tool
        tools.forEach((tool, index) => {
            errors.push(...this.validateTool(tool, index));
        });

        // Check for duplicate tool names
        const toolNames = tools.map(t => t.name).filter(Boolean);
        const duplicates = toolNames.filter((name, index) => toolNames.indexOf(name) !== index);
        if (duplicates.length > 0) {
            errors.push(`Duplicate tool names: ${duplicates.join(', ')}`);
        }

        return errors;
    }

    /**
     * Validate individual tool
     */
    validateTool(tool, index) {
        const errors = [];
        const prefix = `routerTools[${index}]`;

        if (!tool || typeof tool !== 'object') {
            errors.push(`${prefix} must be an object`);
            return errors;
        }

        // Check required fields
        for (const [field, schema] of Object.entries(this.toolSchema)) {
            if (schema.required && !(field in tool)) {
                errors.push(`${prefix} missing required field: ${field}`);
                continue;
            }

            if (field in tool) {
                const value = tool[field];
                if (typeof value !== schema.type) {
                    errors.push(`${prefix}.${field} must be of type ${schema.type}`);
                }

                // Additional validation for specific fields
                if (field === 'name' && typeof value === 'string') {
                    if (value.length === 0) {
                        errors.push(`${prefix}.name cannot be empty`);
                    }
                    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                        errors.push(`${prefix}.name contains invalid characters`);
                    }
                }
            }
        }

        return errors;
    }

    /**
     * Validate mapToRealTool function
     */
    validateMapToRealTool(mapFn) {
        const errors = [];

        if (mapFn !== undefined && mapFn !== null) {
            if (typeof mapFn !== 'function') {
                errors.push('mapToRealTool must be a function');
            } else {
                // Test function with sample inputs
                try {
                    const result = mapFn('test_tool', 'test_action');
                    if (typeof result !== 'string') {
                        errors.push('mapToRealTool must return a string');
                    }
                } catch (error) {
                    errors.push(`mapToRealTool function error: ${error.message}`);
                }
            }
        }

        return errors;
    }

    /**
     * Normalize configuration with defaults
     */
    normalizeConfig(config) {
        const normalized = { ...config };

        // Set defaults for optional fields
        if (!normalized.description) {
            normalized.description = `MCP Router configuration: ${normalized.name}`;
        }

        if (!normalized.mapToRealTool) {
            normalized.mapToRealTool = (toolName, action) => {
                return action ? `${toolName}_${action}` : toolName;
            };
        }

        // Normalize tools
        normalized.routerTools = normalized.routerTools.map(tool => ({
            ...tool,
            inputSchema: tool.inputSchema || { type: 'object', properties: {} }
        }));

        return normalized;
    }

    /**
     * Validate tool name format
     */
    isValidToolName(name) {
        return typeof name === 'string' &&
               name.length > 0 &&
               name.length <= 64 &&
               /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name);
    }

    /**
     * Get configuration summary for logging
     */
    getConfigSummary(config) {
        return {
            name: config.name,
            description: config.description || 'No description',
            backend: `${config.backendCommand} ${config.backendArgs.join(' ')}`,
            toolCount: config.routerTools?.length || 0,
            hasMapping: typeof config.mapToRealTool === 'function',
            features: Object.keys(config.features || {}),
            size: JSON.stringify(config).length
        };
    }

    /**
     * Create minimal valid configuration for testing
     */
    createMinimalConfig(name = 'test') {
        return {
            name,
            backendCommand: 'echo',
            backendArgs: ['test'],
            routerTools: [{
                name: 'test_tool',
                description: 'Test tool',
                inputSchema: { type: 'object', properties: {} }
            }]
        };
    }
}

/**
 * Quick configuration validation function
 */
export function validateConfig(config) {
    const validator = new ConfigValidator();
    return validator.validate(config);
}

/**
 * Configuration loader with validation
 */
export async function loadAndValidateConfig(configPath) {
    try {
        const module = await import(configPath);
        const config = module.default;

        return validateConfig(config);
    } catch (error) {
        throw new RouterError(
            `Failed to load configuration from ${configPath}: ${error.message}`,
            'CONFIG_LOAD_FAILED',
            { configPath, originalError: error.message }
        );
    }
}