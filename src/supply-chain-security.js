/**
 * Supply Chain Security Scanner
 * Comprehensive dependency vulnerability assessment and monitoring
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { RouterError } from './error-handler.js';

/**
 * Supply chain security error
 */
export class SupplyChainSecurityError extends RouterError {
    constructor(message, code = 'SUPPLY_CHAIN_ERROR', details = null) {
        super(message, code, details);
        this.name = 'SupplyChainSecurityError';
    }
}

/**
 * Dependency vulnerability scanner
 */
export class DependencyScanner {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
        this.enableNetworkScans = options.enableNetworkScans !== false;
        this.cachePath = options.cachePath || path.join(this.projectPath, '.security-cache');
        this.scanResults = new Map();
        this.lastScanTime = null;

        // Known vulnerable patterns
        this.vulnerablePatterns = [
            // Package names with known security issues
            /^colors@[01]\./,           // colors package takeover
            /^ua-parser-js@0\.7\.[12][0-9]/,  // ua-parser-js malware
            /^event-stream@[0-3]\./,    // event-stream bitcoin miner
            /^eslint-scope@3\.7\.2/,    // eslint-scope malware
            /^bootstrap@[0-3]\./,       // Old bootstrap XSS
            /^lodash@[0-4]\.17\.[0-20]/, // lodash prototype pollution

            // Suspicious package patterns
            /discord.*token/i,          // Discord token stealers
            /crypto.*miner/i,           // Cryptocurrency miners
            /keylogger/i,               // Keyloggers
            /backdoor/i,                // Backdoors
        ];

        // High-risk dependency patterns
        this.highRiskPatterns = [
            /eval/,                     // Code evaluation
            /Function\s*\(/,           // Dynamic function creation
            /require\s*\(\s*[^'"].*\)/, // Dynamic require
            /process\.env/,             // Environment access
            /child_process/,            // Process execution
            /fs\.(read|write|unlink)/,  // File system operations
            /net\.connect/,             // Network connections
            /http\.request/,            // HTTP requests
        ];
    }

    /**
     * Perform comprehensive supply chain security audit
     */
    async performSecurityAudit() {
        const auditResults = {
            timestamp: new Date().toISOString(),
            projectPath: this.projectPath,
            vulnerabilities: [],
            riskAssessment: {},
            recommendations: [],
            summary: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
                total: 0
            }
        };

        try {
            // 1. Package.json analysis
            const packageAnalysis = await this.analyzePackageJson();
            auditResults.packageAnalysis = packageAnalysis;

            // 2. Dependency tree scanning
            const dependencyVulns = await this.scanDependencyTree();
            auditResults.vulnerabilities.push(...dependencyVulns);

            // 3. npm audit if available
            const npmAuditResults = await this.runNpmAudit();
            auditResults.npmAudit = npmAuditResults;

            // 4. License compliance check
            const licenseCheck = await this.checkLicenseCompliance();
            auditResults.licenseCompliance = licenseCheck;

            // 5. Malware pattern detection
            const malwareCheck = await this.detectMalwarePatterns();
            auditResults.malwareDetection = malwareCheck;

            // 6. Supply chain integrity
            const integrityCheck = await this.verifySupplyChainIntegrity();
            auditResults.integrityCheck = integrityCheck;

            // Aggregate results
            this.aggregateSecurityResults(auditResults);

            // Cache results
            await this.cacheResults(auditResults);

            this.lastScanTime = Date.now();

            return auditResults;

        } catch (error) {
            throw new SupplyChainSecurityError(
                `Security audit failed: ${error.message}`,
                'AUDIT_FAILED',
                { originalError: error.message }
            );
        }
    }

    /**
     * Analyze package.json for security issues
     */
    async analyzePackageJson() {
        const analysis = {
            packageJsonPath: null,
            dependencies: {},
            devDependencies: {},
            scripts: {},
            securityIssues: [],
            riskLevel: 'low'
        };

        try {
            const packageJsonPath = path.join(this.projectPath, 'package.json');
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

            analysis.packageJsonPath = packageJsonPath;
            analysis.dependencies = packageJson.dependencies || {};
            analysis.devDependencies = packageJson.devDependencies || {};
            analysis.scripts = packageJson.scripts || {};

            // Check for suspicious scripts
            for (const [scriptName, scriptContent] of Object.entries(analysis.scripts)) {
                if (this.isSuspiciousScript(scriptContent)) {
                    analysis.securityIssues.push({
                        type: 'SUSPICIOUS_SCRIPT',
                        severity: 'high',
                        script: scriptName,
                        content: scriptContent,
                        reason: 'Script contains potentially dangerous commands'
                    });
                }
            }

            // Check dependency versions for known vulnerabilities
            for (const [depName, version] of Object.entries(analysis.dependencies)) {
                const vulnerability = this.checkKnownVulnerability(depName, version);
                if (vulnerability) {
                    analysis.securityIssues.push(vulnerability);
                }
            }

            // Assess overall risk level
            analysis.riskLevel = this.assessRiskLevel(analysis.securityIssues);

        } catch (error) {
            analysis.securityIssues.push({
                type: 'PACKAGE_JSON_ERROR',
                severity: 'medium',
                error: error.message
            });
        }

        return analysis;
    }

    /**
     * Check if script contains suspicious patterns
     */
    isSuspiciousScript(script) {
        const suspiciousPatterns = [
            /curl.*\|\s*sh/,           // Pipe to shell
            /wget.*\|\s*sh/,           // Pipe to shell
            /rm\s+-rf\s+\//,           // Dangerous rm commands
            /chmod\s+777/,             // Dangerous permissions
            /sudo\s+/,                 // Root execution
            /eval\s*\(/,               // Code evaluation
            /__filename.*require/,     // Dynamic requires
            /process\.env\.\w+.*=.*stdin/, // Env var from stdin
        ];

        return suspiciousPatterns.some(pattern => pattern.test(script));
    }

    /**
     * Check for known vulnerabilities in dependencies
     */
    checkKnownVulnerability(packageName, version) {
        const fullName = `${packageName}@${version}`;

        for (const pattern of this.vulnerablePatterns) {
            if (pattern.test(fullName)) {
                return {
                    type: 'KNOWN_VULNERABILITY',
                    severity: 'critical',
                    package: packageName,
                    version: version,
                    pattern: pattern.source,
                    recommendation: 'Update to latest secure version immediately'
                };
            }
        }

        return null;
    }

    /**
     * Scan dependency tree for security issues
     */
    async scanDependencyTree() {
        const vulnerabilities = [];

        try {
            // Try to read package-lock.json or yarn.lock
            const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
            let lockFileContent = null;
            let lockFileType = null;

            for (const lockFile of lockFiles) {
                try {
                    const lockPath = path.join(this.projectPath, lockFile);
                    lockFileContent = await fs.readFile(lockPath, 'utf8');
                    lockFileType = lockFile;
                    break;
                } catch {
                    continue;
                }
            }

            if (!lockFileContent) {
                vulnerabilities.push({
                    type: 'NO_LOCK_FILE',
                    severity: 'medium',
                    description: 'No package lock file found - versions not pinned',
                    recommendation: 'Use npm install --package-lock-only to generate lock file'
                });
                return vulnerabilities;
            }

            // Parse and analyze lock file
            const dependencies = this.parseLockFile(lockFileContent, lockFileType);

            for (const [depName, depInfo] of dependencies) {
                // Check for suspicious package names
                if (this.isSuspiciousPackageName(depName)) {
                    vulnerabilities.push({
                        type: 'SUSPICIOUS_PACKAGE',
                        severity: 'high',
                        package: depName,
                        version: depInfo.version,
                        reason: 'Package name matches suspicious pattern'
                    });
                }

                // Check for version anomalies
                const versionIssue = this.checkVersionAnomalies(depName, depInfo.version);
                if (versionIssue) {
                    vulnerabilities.push(versionIssue);
                }

                // Check for high-risk features
                if (this.enableNetworkScans && depInfo.resolved) {
                    const riskAssessment = await this.assessPackageRisk(depName, depInfo);
                    if (riskAssessment.risk === 'high') {
                        vulnerabilities.push({
                            type: 'HIGH_RISK_PACKAGE',
                            severity: 'medium',
                            package: depName,
                            version: depInfo.version,
                            risks: riskAssessment.risks
                        });
                    }
                }
            }

        } catch (error) {
            vulnerabilities.push({
                type: 'DEPENDENCY_SCAN_ERROR',
                severity: 'medium',
                error: error.message
            });
        }

        return vulnerabilities;
    }

    /**
     * Run npm audit command if available
     */
    async runNpmAudit() {
        return new Promise((resolve) => {
            const npmAudit = spawn('npm', ['audit', '--json'], {
                cwd: this.projectPath,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            npmAudit.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            npmAudit.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            npmAudit.on('close', (code) => {
                try {
                    if (stdout) {
                        const auditResult = JSON.parse(stdout);
                        resolve({
                            available: true,
                            exitCode: code,
                            vulnerabilities: auditResult.vulnerabilities || {},
                            metadata: auditResult.metadata || {}
                        });
                    } else {
                        resolve({
                            available: false,
                            error: stderr || 'npm audit not available',
                            exitCode: code
                        });
                    }
                } catch (error) {
                    resolve({
                        available: false,
                        error: `Failed to parse npm audit output: ${error.message}`,
                        exitCode: code
                    });
                }
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                npmAudit.kill();
                resolve({
                    available: false,
                    error: 'npm audit timeout',
                    exitCode: null
                });
            }, 30000);
        });
    }

    /**
     * Check license compliance
     */
    async checkLicenseCompliance() {
        const compliance = {
            allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'],
            restrictedLicenses: ['GPL', 'AGPL', 'LGPL', 'SSPL'],
            violations: [],
            unknown: []
        };

        // This would typically integrate with a license scanning tool
        // For now, we'll do basic pattern checking

        try {
            const nodeModulesPath = path.join(this.projectPath, 'node_modules');

            // Check if node_modules exists
            try {
                await fs.access(nodeModulesPath);
            } catch {
                compliance.violations.push({
                    type: 'NO_NODE_MODULES',
                    severity: 'low',
                    description: 'node_modules directory not found'
                });
                return compliance;
            }

            // Simple license check (in production, use a proper license scanner)
            const packageDirs = await fs.readdir(nodeModulesPath);

            for (const dir of packageDirs.slice(0, 10)) { // Limit for performance
                if (dir.startsWith('.') || dir.startsWith('@')) continue;

                try {
                    const packageJsonPath = path.join(nodeModulesPath, dir, 'package.json');
                    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

                    if (packageJson.license) {
                        const license = Array.isArray(packageJson.license)
                            ? packageJson.license[0]
                            : packageJson.license;

                        if (compliance.restrictedLicenses.some(restricted =>
                            license.toUpperCase().includes(restricted))) {
                            compliance.violations.push({
                                type: 'RESTRICTED_LICENSE',
                                severity: 'high',
                                package: dir,
                                license: license
                            });
                        }
                    } else {
                        compliance.unknown.push({
                            package: dir,
                            reason: 'No license specified'
                        });
                    }
                } catch {
                    // Skip packages we can't read
                    continue;
                }
            }

        } catch (error) {
            compliance.violations.push({
                type: 'LICENSE_CHECK_ERROR',
                severity: 'low',
                error: error.message
            });
        }

        return compliance;
    }

    /**
     * Detect malware patterns in dependencies
     */
    async detectMalwarePatterns() {
        const detection = {
            scannedFiles: 0,
            suspiciousPatterns: [],
            highRiskFiles: []
        };

        try {
            const nodeModulesPath = path.join(this.projectPath, 'node_modules');

            try {
                await fs.access(nodeModulesPath);
            } catch {
                return { ...detection, error: 'node_modules not found' };
            }

            // Scan for suspicious patterns in main files
            const packageDirs = await fs.readdir(nodeModulesPath);

            for (const dir of packageDirs.slice(0, 20)) { // Limit scanning
                if (dir.startsWith('.')) continue;

                try {
                    const mainFile = await this.findMainFile(path.join(nodeModulesPath, dir));
                    if (mainFile) {
                        const content = await fs.readFile(mainFile, 'utf8');
                        detection.scannedFiles++;

                        const patterns = this.scanForMalwarePatterns(content);
                        if (patterns.length > 0) {
                            detection.suspiciousPatterns.push({
                                package: dir,
                                file: mainFile,
                                patterns: patterns
                            });
                        }

                        // Check for high-risk operations
                        const riskLevel = this.assessFileRiskLevel(content);
                        if (riskLevel === 'high') {
                            detection.highRiskFiles.push({
                                package: dir,
                                file: mainFile,
                                reason: 'Contains high-risk operations'
                            });
                        }
                    }
                } catch {
                    // Skip packages we can't analyze
                    continue;
                }
            }

        } catch (error) {
            detection.error = error.message;
        }

        return detection;
    }

    /**
     * Verify supply chain integrity
     */
    async verifySupplyChainIntegrity() {
        const integrity = {
            lockFileIntegrity: false,
            packageIntegrity: {},
            checksumVerification: {},
            issues: []
        };

        try {
            // Check if lock file exists and is consistent with package.json
            const packageJsonExists = await this.fileExists(path.join(this.projectPath, 'package.json'));
            const lockFileExists = await this.fileExists(path.join(this.projectPath, 'package-lock.json'));

            if (packageJsonExists && !lockFileExists) {
                integrity.issues.push({
                    type: 'MISSING_LOCK_FILE',
                    severity: 'medium',
                    description: 'package.json exists but no lock file found'
                });
            }

            integrity.lockFileIntegrity = packageJsonExists && lockFileExists;

            // Additional integrity checks would go here
            // (checksum verification, registry validation, etc.)

        } catch (error) {
            integrity.issues.push({
                type: 'INTEGRITY_CHECK_ERROR',
                severity: 'low',
                error: error.message
            });
        }

        return integrity;
    }

    /**
     * Scan content for malware patterns
     */
    scanForMalwarePatterns(content) {
        const patterns = [];

        // Common malware indicators
        const malwareIndicators = [
            { pattern: /bitcoin.*wallet|bitcoin.*address/i, type: 'cryptocurrency' },
            { pattern: /discord.*token|discord.*webhook/i, type: 'discord_theft' },
            { pattern: /keylog|capture.*key/i, type: 'keylogger' },
            { pattern: /password.*steal|credential.*harvest/i, type: 'credential_theft' },
            { pattern: /exec.*\(.*shell|spawn.*shell/i, type: 'shell_execution' },
            { pattern: /eval.*request|eval.*http/i, type: 'remote_code_execution' },
            { pattern: /\/etc\/passwd|\/etc\/shadow/i, type: 'system_access' },
            { pattern: /crypto.*mine|mining.*pool/i, type: 'cryptominer' }
        ];

        for (const indicator of malwareIndicators) {
            if (indicator.pattern.test(content)) {
                patterns.push({
                    type: indicator.type,
                    pattern: indicator.pattern.source,
                    severity: 'high'
                });
            }
        }

        return patterns;
    }

    /**
     * Helper methods
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async findMainFile(packagePath) {
        const possibleFiles = ['index.js', 'main.js', 'lib/index.js', 'dist/index.js'];

        for (const file of possibleFiles) {
            const fullPath = path.join(packagePath, file);
            if (await this.fileExists(fullPath)) {
                return fullPath;
            }
        }

        return null;
    }

    isSuspiciousPackageName(name) {
        const suspiciousPatterns = [
            /discord.*token/i,
            /bitcoin.*steal/i,
            /password.*dump/i,
            /hack.*tool/i,
            /exploit/i,
            /backdoor/i,
            /malware/i,
            /keylogger/i
        ];

        return suspiciousPatterns.some(pattern => pattern.test(name));
    }

    parseLockFile(content, type) {
        const dependencies = new Map();

        try {
            if (type === 'package-lock.json') {
                const lockData = JSON.parse(content);
                if (lockData.dependencies) {
                    for (const [name, info] of Object.entries(lockData.dependencies)) {
                        dependencies.set(name, {
                            version: info.version,
                            resolved: info.resolved,
                            integrity: info.integrity
                        });
                    }
                }
            }
            // Add support for other lock file types as needed
        } catch (error) {
            // Return empty map on parse error
        }

        return dependencies;
    }

    assessFileRiskLevel(content) {
        let riskScore = 0;

        for (const pattern of this.highRiskPatterns) {
            if (pattern.test(content)) {
                riskScore += 1;
            }
        }

        if (riskScore >= 3) return 'high';
        if (riskScore >= 1) return 'medium';
        return 'low';
    }

    assessRiskLevel(issues) {
        const criticalCount = issues.filter(i => i.severity === 'critical').length;
        const highCount = issues.filter(i => i.severity === 'high').length;

        if (criticalCount > 0) return 'critical';
        if (highCount > 2) return 'high';
        if (highCount > 0) return 'medium';
        return 'low';
    }

    aggregateSecurityResults(auditResults) {
        const summary = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

        // Count vulnerabilities by severity
        for (const vuln of auditResults.vulnerabilities) {
            if (summary.hasOwnProperty(vuln.severity)) {
                summary[vuln.severity]++;
                summary.total++;
            }
        }

        auditResults.summary = summary;

        // Generate recommendations
        auditResults.recommendations = this.generateRecommendations(auditResults);
    }

    generateRecommendations(auditResults) {
        const recommendations = [];

        if (auditResults.summary.critical > 0) {
            recommendations.push({
                priority: 'critical',
                action: 'Update critical vulnerabilities immediately',
                details: 'Critical security vulnerabilities pose immediate risk'
            });
        }

        if (!auditResults.packageAnalysis.packageJsonPath) {
            recommendations.push({
                priority: 'high',
                action: 'Create package.json file',
                details: 'No package.json found - cannot track dependencies'
            });
        }

        if (auditResults.vulnerabilities.some(v => v.type === 'NO_LOCK_FILE')) {
            recommendations.push({
                priority: 'medium',
                action: 'Generate package lock file',
                details: 'Lock file ensures reproducible installations'
            });
        }

        return recommendations;
    }

    async cacheResults(results) {
        try {
            await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
            await fs.writeFile(this.cachePath, JSON.stringify(results, null, 2));
        } catch {
            // Cache failure is non-critical
        }
    }
}

/**
 * Quick security check for immediate use
 */
export async function quickSecurityCheck(projectPath = process.cwd()) {
    const scanner = new DependencyScanner({
        projectPath,
        enableNetworkScans: false // Disable for quick check
    });

    try {
        const results = await scanner.performSecurityAudit();

        return {
            secure: results.summary.critical === 0 && results.summary.high === 0,
            summary: results.summary,
            criticalIssues: results.vulnerabilities.filter(v =>
                v.severity === 'critical' || v.severity === 'high'
            ),
            recommendations: results.recommendations.slice(0, 3) // Top 3 recommendations
        };
    } catch (error) {
        return {
            secure: false,
            error: error.message,
            summary: { critical: 1, high: 0, medium: 0, low: 0, total: 1 },
            criticalIssues: [{
                type: 'SCAN_FAILED',
                severity: 'critical',
                description: `Security scan failed: ${error.message}`
            }]
        };
    }
}

/**
 * Export main scanner class and utilities
 */
export { DependencyScanner };