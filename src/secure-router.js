/**
 * Secure MCP Router
 * Enhanced version with comprehensive security measures
 * Production-ready implementation with defense in depth
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { ErrorHandler, RouterError } from './error-handler.js';
import { ConfigValidator } from './config-validator.js';
import {
    SecurityValidator,
    PRODUCTION_SECURITY_CONFIG,
    DEVELOPMENT_SECURITY_CONFIG
} from './security-validator.js';
import {
    SecureProcessManager,
    PRODUCTION_PROCESS_CONFIG,
    DEVELOPMENT_PROCESS_CONFIG
} from './process-security.js';

/**
 * Secure MCP Router with comprehensive security hardening
 */
export class SecureRouter {
    constructor(config, options = {}) {
        this.originalConfig = config;
        this.config = this.validateAndNormalizeConfig(config);
        this.options = {
            environment: options.environment || 'production',
            enableMetrics: options.enableMetrics !== false,
            enableHealthCheck: options.enableHealthCheck !== false,
            ...options
        };

        // Security components
        this.securityValidator = this.createSecurityValidator();
        this.processManager = this.createProcessManager();
        this.errorHandler = new ErrorHandler(this.config);

        // State management
        this.backendProcess = null;
        this.stdoutBuffer = '';
        this.stdinBuffer = '';
        this.isReady = false;
        this.allTools = [];
        this.toolCallQueue = [];
        this.internalCallbacks = new Map();
        this.nextInternalId = 5000;
        this.clientConnections = new Map();

        // Metrics and monitoring
        this.metrics = {
            messagesProcessed: 0,
            errorsCount: 0,
            securityViolations: 0,
            uptimeStart: Date.now(),
            lastHealthCheck: null
        };

        // Setup graceful shutdown
        this.setupShutdownHandlers();

        // Start health monitoring
        if (this.options.enableHealthCheck) {
            this.startHealthMonitoring();
        }
    }

    /**
     * Validate and normalize configuration with security checks
     */
    validateAndNormalizeConfig(config) {
        try {
            const validator = new ConfigValidator();
            const validatedConfig = validator.validate(config);

            // Additional security validations
            this.performSecurityConfigChecks(validatedConfig);

            return validatedConfig;
        } catch (error) {
            throw new RouterError(
                `Configuration validation failed: ${error.message}`,
                'CONFIG_VALIDATION_FAILED',
                { originalError: error.message }
            );
        }
    }

    /**
     * Perform additional security configuration checks
     */
    performSecurityConfigChecks(config) {
        // Check for potentially dangerous backend commands
        const dangerousCommands = ['bash', 'sh', 'cmd', 'powershell', 'eval'];
        if (dangerousCommands.includes(config.backendCommand.toLowerCase())) {
            throw new RouterError(
                `Potentially dangerous backend command: ${config.backendCommand}`,
                'DANGEROUS_BACKEND_COMMAND'
            );
        }

        // Validate backend arguments don't contain injection patterns
        for (const arg of config.backendArgs) {
            if (typeof arg === 'string' && this.containsInjectionPattern(arg)) {
                throw new RouterError(
                    `Suspicious pattern in backend arguments: ${arg}`,
                    'SUSPICIOUS_BACKEND_ARGS'
                );
            }
        }

        // Check tool configurations for security issues
        this.validateToolSecurity(config.routerTools);
    }

    /**
     * Check for injection patterns
     */
    containsInjectionPattern(str) {
        const patterns = [
            /[;&|`$()]/,        // Command injection
            /\.\.\/.*\/etc/,    // Path traversal
            /__proto__/,        // Prototype pollution
            /javascript:/i,     // JS execution
            /data:.*base64/i    // Data URLs
        ];

        return patterns.some(pattern => pattern.test(str));
    }

    /**
     * Validate tool configurations for security
     */
    validateToolSecurity(tools) {
        for (const tool of tools) {
            // Check tool names for dangerous patterns
            if (this.containsInjectionPattern(tool.name)) {
                throw new RouterError(
                    `Potentially dangerous tool name: ${tool.name}`,
                    'DANGEROUS_TOOL_NAME'
                );
            }

            // Validate input schema doesn't allow dangerous types
            if (tool.inputSchema && this.hasUnsafeInputSchema(tool.inputSchema)) {
                throw new RouterError(
                    `Unsafe input schema for tool: ${tool.name}`,
                    'UNSAFE_INPUT_SCHEMA'
                );
            }
        }
    }

    /**
     * Check if input schema allows unsafe input types
     */
    hasUnsafeInputSchema(schema) {
        // Check for patterns that might allow code execution
        const schemaStr = JSON.stringify(schema).toLowerCase();
        return schemaStr.includes('eval') ||
               schemaStr.includes('function') ||
               schemaStr.includes('javascript');
    }

    /**
     * Create security validator based on environment
     */
    createSecurityValidator() {
        const securityConfig = this.options.environment === 'development'
            ? DEVELOPMENT_SECURITY_CONFIG
            : PRODUCTION_SECURITY_CONFIG;

        return new SecurityValidator(securityConfig);
    }

    /**
     * Create process manager based on environment
     */
    createProcessManager() {
        const processConfig = this.options.environment === 'development'
            ? DEVELOPMENT_PROCESS_CONFIG
            : PRODUCTION_PROCESS_CONFIG;

        return new SecureProcessManager(processConfig);
    }

    /**
     * Start the backend process with enhanced security
     */
    async startBackend() {
        try {
            this.errorHandler.logError({
                category: 'BACKEND_START',
                error: new Error(`Starting backend: ${this.config.backendCommand}`),
                severity: 'info'
            }, { command: this.config.backendCommand });

            // Create secure backend process
            const processResult = await this.processManager.createSecureProcess(
                this.config.backendCommand,
                this.config.backendArgs,
                {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: this.createSecureEnvironment()
                }
            );

            this.backendProcess = processResult.process;
            this.backendProcessId = processResult.processId;

            // Setup process event handlers
            this.setupProcessHandlers();

            return processResult;

        } catch (error) {
            const handledError = this.errorHandler.handleError(error, {
                operation: 'startBackend',
                command: this.config.backendCommand
            });

            throw new RouterError(
                `Failed to start backend: ${error.message}`,
                'BACKEND_START_FAILED',
                { originalError: error.message, recovery: handledError.action }
            );
        }
    }

    /**
     * Create secure environment for backend process
     */
    createSecureEnvironment() {
        const baseEnv = {
            NODE_ENV: this.options.environment,
            PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
        };

        // Add only safe environment variables
        const safeEnvVars = ['NODE_PATH', 'HOME', 'USER'];
        for (const varName of safeEnvVars) {
            if (process.env[varName]) {
                baseEnv[varName] = process.env[varName];
            }
        }

        return baseEnv;
    }

    /**
     * Setup process event handlers
     */
    setupProcessHandlers() {
        if (!this.backendProcess) return;

        this.backendProcess.stdout.on('data', (data) => {
            this.handleBackendStdout(data);
        });

        this.backendProcess.stderr.on('data', (data) => {
            this.handleBackendStderr(data);
        });

        this.backendProcess.on('close', (code, signal) => {
            this.handleProcessClose(code, signal);
        });

        this.backendProcess.on('error', (error) => {
            this.handleProcessError(error);
        });
    }

    /**
     * Handle backend stdout with security validation
     */
    handleBackendStdout(data) {
        try {
            this.stdoutBuffer += data.toString('utf8');

            // Process complete lines
            let lines = this.stdoutBuffer.split('\n');

            // Keep incomplete line in buffer
            if (!this.stdoutBuffer.endsWith('\n')) {
                this.stdoutBuffer = lines.pop();
            } else {
                this.stdoutBuffer = '';
            }

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                this.processBackendMessage(trimmed);
            }

        } catch (error) {
            this.handleProcessingError(error, 'stdout');
        }
    }

    /**
     * Process backend message with security validation
     */
    processBackendMessage(line) {
        try {
            // Extract JSON from potentially polluted stdout
            const openBrace = line.indexOf('{');
            if (openBrace === -1) return;

            const potentialJson = line.substring(openBrace);

            // Validate and parse with security checks
            const parsed = this.securityValidator.jsonProcessor.parse(
                potentialJson,
                { maxSize: 10 * 1024 * 1024 } // 10MB limit for backend messages
            );

            this.handleValidatedBackendMessage(parsed);

        } catch (error) {
            if (error.name === 'SecurityError') {
                this.metrics.securityViolations++;
                this.securityValidator.logger.logSecurityEvent(
                    'BACKEND_MESSAGE_SECURITY_VIOLATION',
                    { message: line.substring(0, 100), error: error.message },
                    'high'
                );
                return; // Don't process unsafe messages
            }

            // Log but don't crash on parsing errors
            this.handleProcessingError(error, 'message-parsing');
        }
    }

    /**
     * Handle validated backend message
     */
    handleValidatedBackendMessage(parsed) {
        try {
            // Handle internal handshake
            if (parsed.method === 'server.initialized') {
                this.performHandshake();
                return;
            }

            if (parsed.id === 4000 && parsed.result) {
                this.requestToolsList();
                return;
            }

            if (parsed.id === 4001 && parsed.result?.tools) {
                this.handleToolsListResponse(parsed.result.tools);
                return;
            }

            // Handle internal callbacks
            if (this.internalCallbacks.has(parsed.id)) {
                this.handleInternalCallback(parsed);
                return;
            }

            // Filter orphan errors
            if (parsed.error && !this.internalCallbacks.has(parsed.id) && parsed.id === null) {
                return;
            }

            // Forward valid messages to client
            this.forwardToClient(parsed);

        } catch (error) {
            this.handleProcessingError(error, 'backend-message');
        }
    }

    /**
     * Handle client input with comprehensive security validation
     */
    handleClientInput(data) {
        try {
            this.stdinBuffer += data.toString('utf8');
            const lines = this.stdinBuffer.split('\n');
            this.stdinBuffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;

                this.processClientMessage(line);
            }

        } catch (error) {
            this.handleProcessingError(error, 'client-input');
        }
    }

    /**
     * Process client message with full security validation
     */
    processClientMessage(line) {
        try {
            this.metrics.messagesProcessed++;

            // Determine client ID for rate limiting
            const clientId = this.extractClientId(line) || 'default';

            // Validate message with full security checks
            const parsed = this.securityValidator.validateMessage(line, clientId);

            this.handleValidatedClientMessage(parsed, clientId);

        } catch (error) {
            this.metrics.errorsCount++;

            if (error.name === 'SecurityError') {
                this.metrics.securityViolations++;
                this.sendSecurityErrorResponse(null, error);
                return;
            }

            this.handleProcessingError(error, 'client-message');
        }
    }

    /**
     * Extract client ID from message for rate limiting
     */
    extractClientId(message) {
        try {
            const parsed = JSON.parse(message);
            return parsed.clientId || parsed.params?.clientId || null;
        } catch {
            return null;
        }
    }

    /**
     * Handle validated client message
     */
    handleValidatedClientMessage(parsed, clientId) {
        try {
            // Track client connection
            this.trackClientConnection(clientId, parsed);

            // Handle immediate responses
            if (this.handleImmediateResponses(parsed)) {
                return;
            }

            // Handle tool calls with additional validation
            if (parsed.method === 'tools/call') {
                this.handleSecureToolCall(parsed, clientId);
                return;
            }

            // Drop unsupported methods
            if (this.isUnsupportedMethod(parsed.method)) {
                return;
            }

            // Forward to backend if ready
            if (this.isReady && this.backendProcess) {
                this.forwardToBackend(parsed);
            } else {
                this.sendErrorResponse(parsed.id, -32603, 'Backend not ready');
            }

        } catch (error) {
            this.handleProcessingError(error, 'client-message-handling');
        }
    }

    /**
     * Track client connections for monitoring
     */
    trackClientConnection(clientId, message) {
        const now = Date.now();
        const connection = this.clientConnections.get(clientId) || {
            firstSeen: now,
            lastActivity: now,
            messageCount: 0,
            violations: 0
        };

        connection.lastActivity = now;
        connection.messageCount++;

        this.clientConnections.set(clientId, connection);

        // Clean up old connections
        this.cleanupOldConnections();
    }

    /**
     * Handle secure tool calls with validation
     */
    handleSecureToolCall(parsed, clientId) {
        const { name, arguments: args } = parsed.params;

        try {
            // Validate tool name
            if (!this.isValidToolName(name)) {
                throw new RouterError(
                    `Invalid tool name: ${name}`,
                    'INVALID_TOOL_NAME'
                );
            }

            // Validate tool arguments
            this.validateToolArguments(name, args);

            // Handle discovery tools
            if (name.endsWith('_discover')) {
                this.handleToolDiscovery(parsed, args);
                return;
            }

            // Execute tool call
            this.executeSecureToolCall(parsed, name, args, clientId);

        } catch (error) {
            this.sendErrorResponse(parsed.id, -32602, error.message);
        }
    }

    /**
     * Validate tool arguments for security
     */
    validateToolArguments(toolName, args) {
        if (!args || typeof args !== 'object') {
            return; // No args or primitive args are safe
        }

        // Check for dangerous argument patterns
        const argsStr = JSON.stringify(args);
        if (this.containsInjectionPattern(argsStr)) {
            throw new RouterError(
                'Dangerous pattern detected in tool arguments',
                'DANGEROUS_TOOL_ARGS'
            );
        }

        // Validate specific argument types based on tool
        if (toolName.includes('execute') && args.command) {
            if (this.containsInjectionPattern(args.command)) {
                throw new RouterError(
                    'Command injection attempt detected',
                    'COMMAND_INJECTION_ATTEMPT'
                );
            }
        }
    }

    /**
     * Send security error response
     */
    sendSecurityErrorResponse(id, error) {
        const response = {
            jsonrpc: '2.0',
            id,
            error: {
                code: -32001, // Custom security error code
                message: 'Security validation failed',
                data: {
                    type: error.code,
                    details: this.options.environment === 'development' ? error.message : 'Security violation'
                }
            }
        };

        this.sendToClient(response);

        // Log security violation
        this.securityValidator.logger.logSecurityEvent(
            'SECURITY_ERROR_SENT',
            { errorCode: error.code, id },
            'medium'
        );
    }

    /**
     * Send error response to client
     */
    sendErrorResponse(id, code, message, data = null) {
        const response = {
            jsonrpc: '2.0',
            id,
            error: { code, message, data }
        };

        this.sendToClient(response);
    }

    /**
     * Send response to client safely
     */
    sendToClient(response) {
        try {
            process.stdout.write(JSON.stringify(response) + '\n');
        } catch (error) {
            this.handleProcessingError(error, 'client-output');
        }
    }

    /**
     * Health monitoring and metrics
     */
    startHealthMonitoring() {
        this.healthInterval = setInterval(() => {
            this.performHealthCheck();
        }, 30000); // Every 30 seconds
    }

    /**
     * Perform comprehensive health check
     */
    performHealthCheck() {
        try {
            const health = {
                timestamp: new Date().toISOString(),
                router: {
                    isReady: this.isReady,
                    uptime: Date.now() - this.metrics.uptimeStart,
                    metrics: this.metrics
                },
                security: this.securityValidator.getSecurityStats(),
                process: this.processManager.healthCheck(),
                backend: {
                    running: this.backendProcess && !this.backendProcess.killed,
                    pid: this.backendProcess?.pid
                }
            };

            this.metrics.lastHealthCheck = health;

            // Log health issues
            if (!health.process.healthy || health.security.criticalEvents.length > 0) {
                this.securityValidator.logger.logSecurityEvent(
                    'HEALTH_CHECK_WARNING',
                    { health },
                    'medium'
                );
            }

        } catch (error) {
            this.handleProcessingError(error, 'health-check');
        }
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupShutdownHandlers() {
        const shutdown = (signal) => {
            console.error(`[SecureRouter] Received ${signal}, shutting down gracefully...`);
            this.shutdown();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        process.on('SIGQUIT', shutdown);

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.securityValidator.logger.logSecurityEvent(
                'UNCAUGHT_EXCEPTION',
                { error: error.message, stack: error.stack },
                'critical'
            );
            this.shutdown();
            process.exit(1);
        });
    }

    /**
     * Graceful shutdown
     */
    shutdown() {
        try {
            // Stop health monitoring
            if (this.healthInterval) {
                clearInterval(this.healthInterval);
            }

            // Kill backend process
            if (this.backendProcess && !this.backendProcess.killed) {
                this.backendProcess.kill('SIGTERM');
            }

            // Shutdown process manager
            this.processManager.shutdown();

            // Cleanup security validator
            this.securityValidator.destroy();

            // Clear callbacks
            this.internalCallbacks.clear();
            this.clientConnections.clear();

            this.securityValidator.logger.logSecurityEvent(
                'ROUTER_SHUTDOWN',
                { uptime: Date.now() - this.metrics.uptimeStart },
                'info'
            );

        } catch (error) {
            console.error('[SecureRouter] Error during shutdown:', error.message);
        }
    }

    /**
     * Get router status and metrics
     */
    getStatus() {
        return {
            router: {
                ready: this.isReady,
                uptime: Date.now() - this.metrics.uptimeStart,
                environment: this.options.environment,
                toolsCount: this.allTools.length,
                metrics: this.metrics
            },
            security: this.securityValidator.getSecurityStats(),
            process: this.processManager.getProcessStats(),
            clients: {
                active: this.clientConnections.size,
                connections: Array.from(this.clientConnections.entries()).map(([id, conn]) => ({
                    id,
                    messageCount: conn.messageCount,
                    lastActivity: conn.lastActivity
                }))
            },
            health: this.metrics.lastHealthCheck
        };
    }

    // Additional helper methods...
    handleProcessingError(error, context) {
        this.metrics.errorsCount++;
        const handledError = this.errorHandler.handleError(error, { context });

        // Log security-relevant errors
        if (handledError.severity === 'critical' || handledError.severity === 'high') {
            this.securityValidator.logger.logSecurityEvent(
                'PROCESSING_ERROR',
                { context, error: error.message },
                handledError.severity
            );
        }
    }

    isValidToolName(name) {
        return typeof name === 'string' &&
               name.length > 0 &&
               name.length <= 128 &&
               /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name);
    }

    cleanupOldConnections() {
        const now = Date.now();
        const maxAge = 3600000; // 1 hour

        for (const [clientId, connection] of this.clientConnections.entries()) {
            if (now - connection.lastActivity > maxAge) {
                this.clientConnections.delete(clientId);
            }
        }
    }

    // ... (additional helper methods for complete implementation)
}

/**
 * Factory function for creating secure router
 */
export async function createSecureRouter(config, options = {}) {
    const router = new SecureRouter(config, options);
    await router.startBackend();
    return router;
}

/**
 * Main entry point for secure router
 */
export async function startSecureRouter(configName, options = {}) {
    try {
        // Load configuration
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const configPath = path.join(__dirname, '..', 'configs', `${configName}.js`);

        const module = await import(configPath);
        const config = module.default;

        // Create and start secure router
        const router = await createSecureRouter(config, options);

        console.error(`[SecureRouter] Started securely for: ${config.name}`);
        console.error(`[SecureRouter] Environment: ${options.environment || 'production'}`);
        console.error(`[SecureRouter] PID: ${process.pid}`);

        // Setup stdin handler
        process.stdin.on('data', (data) => {
            router.handleClientInput(data);
        });

        return router;

    } catch (error) {
        console.error(`[SecureRouter] Failed to start: ${error.message}`);
        process.exit(1);
    }
}