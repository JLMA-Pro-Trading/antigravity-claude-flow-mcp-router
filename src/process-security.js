/**
 * Process Security Manager
 * Enhanced process isolation and sandboxing for backend processes
 */

import { spawn } from 'child_process';
import { RouterError } from './error-handler.js';
import { SecurityLogger } from './security-validator.js';

/**
 * Process Security Error
 */
export class ProcessSecurityError extends RouterError {
    constructor(message, code = 'PROCESS_SECURITY_ERROR', details = null) {
        super(message, code, details);
        this.name = 'ProcessSecurityError';
    }
}

/**
 * Secure Process Manager with sandboxing and resource limits
 */
export class SecureProcessManager {
    constructor(config = {}) {
        this.config = {
            // Process limits
            maxExecutionTime: config.maxExecutionTime || 30000, // 30 seconds
            maxMemoryMB: config.maxMemoryMB || 256,
            maxBufferSize: config.maxBufferSize || 1024 * 1024, // 1MB

            // Security settings
            allowShell: config.allowShell || false,
            allowedCommands: config.allowedCommands || [],
            blockedCommands: config.blockedCommands || ['rm', 'sudo', 'su', 'chmod', 'chown'],

            // Environment
            cleanEnvironment: config.cleanEnvironment !== false,
            allowedEnvVars: config.allowedEnvVars || ['PATH', 'NODE_PATH'],

            // User/Group (Unix only)
            uid: config.uid || null,
            gid: config.gid || null,

            // Working directory
            cwd: config.cwd || process.cwd(),
            restrictCwd: config.restrictCwd !== false
        };

        this.logger = new SecurityLogger({ logLevel: 'info' });
        this.runningProcesses = new Map();
        this.processCount = 0;
        this.maxConcurrentProcesses = config.maxConcurrentProcesses || 10;
    }

    /**
     * Create and start a secure process
     */
    async createSecureProcess(command, args = [], options = {}) {
        // Validate process limits
        this.validateProcessLimits();

        // Validate command security
        this.validateCommand(command, args);

        // Create secure spawn options
        const spawnOptions = this.createSecureSpawnOptions(options);

        // Generate process ID
        const processId = `proc_${++this.processCount}_${Date.now()}`;

        try {
            this.logger.logSecurityEvent(
                'PROCESS_STARTING',
                { processId, command, args: args.slice(0, 5) }, // Limit args in log
                'info'
            );

            // Spawn process with security constraints
            const childProcess = spawn(command, args, spawnOptions);

            // Set up process monitoring
            const processInfo = this.setupProcessMonitoring(processId, childProcess);

            // Track process
            this.runningProcesses.set(processId, processInfo);

            return {
                processId,
                process: childProcess,
                info: processInfo
            };

        } catch (error) {
            this.logger.logSecurityEvent(
                'PROCESS_START_FAILED',
                { processId, command, error: error.message },
                'high'
            );
            throw new ProcessSecurityError(
                `Failed to start secure process: ${error.message}`,
                'PROCESS_START_FAILED',
                { command, originalError: error.message }
            );
        }
    }

    /**
     * Validate process limits before spawning
     */
    validateProcessLimits() {
        if (this.runningProcesses.size >= this.maxConcurrentProcesses) {
            throw new ProcessSecurityError(
                `Maximum concurrent processes exceeded: ${this.maxConcurrentProcesses}`,
                'MAX_PROCESSES_EXCEEDED',
                { current: this.runningProcesses.size, max: this.maxConcurrentProcesses }
            );
        }
    }

    /**
     * Validate command and arguments for security
     */
    validateCommand(command, args) {
        // Check if command is blocked
        if (this.config.blockedCommands.includes(command)) {
            throw new ProcessSecurityError(
                `Command blocked: ${command}`,
                'COMMAND_BLOCKED',
                { command, blockedCommands: this.config.blockedCommands }
            );
        }

        // If allowlist is configured, ensure command is allowed
        if (this.config.allowedCommands.length > 0 &&
            !this.config.allowedCommands.includes(command)) {
            throw new ProcessSecurityError(
                `Command not allowed: ${command}`,
                'COMMAND_NOT_ALLOWED',
                { command, allowedCommands: this.config.allowedCommands }
            );
        }

        // Validate command path for security
        if (command.includes('..') || command.includes('/etc/') || command.includes('/usr/bin/sudo')) {
            throw new ProcessSecurityError(
                `Potentially dangerous command path: ${command}`,
                'DANGEROUS_COMMAND_PATH'
            );
        }

        // Check arguments for injection attempts
        for (const arg of args) {
            if (typeof arg !== 'string') continue;

            if (this.containsSuspiciousPatterns(arg)) {
                throw new ProcessSecurityError(
                    `Suspicious pattern in arguments: ${arg}`,
                    'SUSPICIOUS_ARGUMENTS',
                    { arg }
                );
            }
        }
    }

    /**
     * Check for suspicious patterns in arguments
     */
    containsSuspiciousPatterns(arg) {
        const suspiciousPatterns = [
            /;.*rm\s/,           // Command chaining with rm
            /\|\s*sudo/,         // Piping to sudo
            /`.*`/,              // Command substitution
            /\$\(.*\)/,          // Command substitution
            /__proto__/,         // Prototype pollution
            /\.\.\/.*\/etc/,     // Path traversal to /etc
            /\/dev\/tcp/,        // Network file descriptors
            /\/proc\/self\/fd/,  // Process file descriptors
        ];

        return suspiciousPatterns.some(pattern => pattern.test(arg));
    }

    /**
     * Create secure spawn options
     */
    createSecureSpawnOptions(userOptions = {}) {
        const options = {
            // Basic security
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: this.config.allowShell,
            timeout: this.config.maxExecutionTime,
            killSignal: 'SIGKILL',
            maxBuffer: this.config.maxBufferSize,

            // Working directory
            cwd: this.config.restrictCwd ? this.config.cwd : (userOptions.cwd || this.config.cwd),

            // Merge user options (with security validation)
            ...this.filterUserOptions(userOptions)
        };

        // Environment variables
        if (this.config.cleanEnvironment) {
            options.env = this.createCleanEnvironment();
        } else {
            options.env = process.env;
        }

        // Unix-specific security settings
        if (process.platform === 'linux' || process.platform === 'darwin') {
            if (this.config.uid) options.uid = this.config.uid;
            if (this.config.gid) options.gid = this.config.gid;

            // Additional Unix security options
            options.detached = false; // Prevent orphaned processes
        }

        return options;
    }

    /**
     * Filter and validate user-provided spawn options
     */
    filterUserOptions(userOptions) {
        const allowedOptions = ['stdio', 'env', 'cwd', 'timeout'];
        const filtered = {};

        for (const [key, value] of Object.entries(userOptions)) {
            if (allowedOptions.includes(key)) {
                filtered[key] = value;
            }
        }

        // Validate timeout doesn't exceed maximum
        if (filtered.timeout && filtered.timeout > this.config.maxExecutionTime) {
            filtered.timeout = this.config.maxExecutionTime;
        }

        return filtered;
    }

    /**
     * Create clean environment with only allowed variables
     */
    createCleanEnvironment() {
        const cleanEnv = {};

        for (const varName of this.config.allowedEnvVars) {
            if (process.env[varName]) {
                cleanEnv[varName] = process.env[varName];
            }
        }

        // Add secure defaults
        cleanEnv.PATH = cleanEnv.PATH || '/usr/local/bin:/usr/bin:/bin';
        cleanEnv.HOME = '/tmp'; // Temporary home for sandboxed processes

        return cleanEnv;
    }

    /**
     * Set up process monitoring and auto-cleanup
     */
    setupProcessMonitoring(processId, childProcess) {
        const startTime = Date.now();

        const processInfo = {
            processId,
            pid: childProcess.pid,
            command: childProcess.spawnargs?.[0] || 'unknown',
            startTime,
            status: 'running',
            memoryUsage: 0,
            timeoutHandle: null
        };

        // Set up timeout
        processInfo.timeoutHandle = setTimeout(() => {
            this.killProcess(processId, 'TIMEOUT');
        }, this.config.maxExecutionTime);

        // Monitor process events
        childProcess.on('close', (code, signal) => {
            this.handleProcessExit(processId, code, signal);
        });

        childProcess.on('error', (error) => {
            this.handleProcessError(processId, error);
        });

        // Memory monitoring (if available)
        if (childProcess.pid) {
            const memoryInterval = setInterval(() => {
                this.checkProcessMemory(processId, childProcess.pid);
            }, 5000); // Check every 5 seconds

            processInfo.memoryInterval = memoryInterval;
        }

        return processInfo;
    }

    /**
     * Check process memory usage
     */
    async checkProcessMemory(processId, pid) {
        try {
            // Simple memory check using ps (Unix only)
            if (process.platform === 'linux' || process.platform === 'darwin') {
                const { spawn } = await import('child_process');
                const ps = spawn('ps', ['-p', pid, '-o', 'rss='], { stdio: 'pipe' });

                ps.stdout.on('data', (data) => {
                    const memoryKB = parseInt(data.toString().trim());
                    const memoryMB = memoryKB / 1024;

                    if (memoryMB > this.config.maxMemoryMB) {
                        this.logger.logSecurityEvent(
                            'PROCESS_MEMORY_EXCEEDED',
                            { processId, pid, memoryMB, limit: this.config.maxMemoryMB },
                            'high'
                        );

                        this.killProcess(processId, 'MEMORY_LIMIT');
                    }
                });
            }
        } catch (error) {
            // Memory monitoring failed, but don't kill process
            this.logger.logSecurityEvent(
                'MEMORY_CHECK_FAILED',
                { processId, error: error.message },
                'medium'
            );
        }
    }

    /**
     * Handle process exit
     */
    handleProcessExit(processId, code, signal) {
        const processInfo = this.runningProcesses.get(processId);
        if (!processInfo) return;

        const duration = Date.now() - processInfo.startTime;

        processInfo.status = 'exited';
        processInfo.exitCode = code;
        processInfo.signal = signal;
        processInfo.duration = duration;

        // Clear monitoring
        if (processInfo.timeoutHandle) {
            clearTimeout(processInfo.timeoutHandle);
        }
        if (processInfo.memoryInterval) {
            clearInterval(processInfo.memoryInterval);
        }

        this.logger.logSecurityEvent(
            'PROCESS_EXITED',
            { processId, code, signal, duration },
            code === 0 ? 'info' : 'medium'
        );

        // Remove from running processes after delay (keep for audit)
        setTimeout(() => {
            this.runningProcesses.delete(processId);
        }, 30000); // 30 seconds
    }

    /**
     * Handle process error
     */
    handleProcessError(processId, error) {
        const processInfo = this.runningProcesses.get(processId);
        if (processInfo) {
            processInfo.status = 'error';
            processInfo.error = error.message;
        }

        this.logger.logSecurityEvent(
            'PROCESS_ERROR',
            { processId, error: error.message },
            'high'
        );
    }

    /**
     * Forcefully kill a process
     */
    killProcess(processId, reason) {
        const processInfo = this.runningProcesses.get(processId);
        if (!processInfo) return false;

        try {
            const process = processInfo.process;
            if (process && !process.killed) {
                process.kill('SIGKILL');

                this.logger.logSecurityEvent(
                    'PROCESS_KILLED',
                    { processId, reason, pid: processInfo.pid },
                    'medium'
                );

                return true;
            }
        } catch (error) {
            this.logger.logSecurityEvent(
                'PROCESS_KILL_FAILED',
                { processId, error: error.message },
                'high'
            );
        }

        return false;
    }

    /**
     * Kill all running processes
     */
    killAllProcesses(reason = 'SHUTDOWN') {
        const processIds = Array.from(this.runningProcesses.keys());
        let killedCount = 0;

        for (const processId of processIds) {
            if (this.killProcess(processId, reason)) {
                killedCount++;
            }
        }

        this.logger.logSecurityEvent(
            'ALL_PROCESSES_KILLED',
            { reason, killedCount, totalProcesses: processIds.length },
            'medium'
        );

        return killedCount;
    }

    /**
     * Get process statistics
     */
    getProcessStats() {
        const stats = {
            running: 0,
            exited: 0,
            error: 0,
            total: this.runningProcesses.size,
            maxConcurrent: this.maxConcurrentProcesses
        };

        for (const processInfo of this.runningProcesses.values()) {
            stats[processInfo.status]++;
        }

        return stats;
    }

    /**
     * Get detailed process information
     */
    getProcessDetails() {
        return Array.from(this.runningProcesses.values()).map(info => ({
            processId: info.processId,
            pid: info.pid,
            command: info.command,
            status: info.status,
            startTime: info.startTime,
            duration: info.status === 'running' ? Date.now() - info.startTime : info.duration,
            exitCode: info.exitCode,
            signal: info.signal,
            error: info.error
        }));
    }

    /**
     * Health check for process manager
     */
    healthCheck() {
        const stats = this.getProcessStats();
        const memoryUsage = process.memoryUsage();

        return {
            healthy: stats.running < this.maxConcurrentProcesses &&
                     memoryUsage.heapUsed < 200 * 1024 * 1024, // 200MB
            processes: stats,
            memory: {
                heapUsedMB: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
                heapTotalMB: Math.round(memoryUsage.heapTotal / (1024 * 1024)),
                rssMB: Math.round(memoryUsage.rss / (1024 * 1024))
            },
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Cleanup and shutdown
     */
    shutdown() {
        this.killAllProcesses('MANAGER_SHUTDOWN');
        this.runningProcesses.clear();

        this.logger.logSecurityEvent(
            'PROCESS_MANAGER_SHUTDOWN',
            {},
            'info'
        );
    }
}

/**
 * Factory function for creating secure process manager
 */
export function createSecureProcessManager(config = {}) {
    return new SecureProcessManager(config);
}

/**
 * Production security configuration for process manager
 */
export const PRODUCTION_PROCESS_CONFIG = {
    maxExecutionTime: 30000,     // 30 seconds
    maxMemoryMB: 128,            // 128 MB limit
    maxBufferSize: 512 * 1024,   // 512 KB buffer
    allowShell: false,           // No shell access
    cleanEnvironment: true,      // Clean environment
    restrictCwd: true,           // Restrict working directory
    maxConcurrentProcesses: 5,   // Max 5 concurrent processes
    allowedCommands: [           // Only specific commands
        'node', 'npm', 'npx', 'python3', 'python'
    ],
    blockedCommands: [
        'rm', 'sudo', 'su', 'chmod', 'chown', 'kill', 'killall',
        'bash', 'sh', 'zsh', 'curl', 'wget', 'nc', 'netcat'
    ]
};

/**
 * Development configuration (more lenient)
 */
export const DEVELOPMENT_PROCESS_CONFIG = {
    maxExecutionTime: 60000,     // 60 seconds
    maxMemoryMB: 512,            // 512 MB limit
    maxBufferSize: 2 * 1024 * 1024, // 2 MB buffer
    allowShell: true,            // Allow shell for dev
    cleanEnvironment: false,     // Keep full environment
    restrictCwd: false,          // Don't restrict cwd
    maxConcurrentProcesses: 10,  // More concurrent processes
    allowedCommands: [],         // Allow all commands
    blockedCommands: [           // Only block dangerous ones
        'sudo', 'su', 'rm -rf', 'format', 'fdisk'
    ]
};