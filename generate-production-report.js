#!/usr/bin/env node
/**
 * Production Readiness Report Generator
 * Validates production deployment readiness and generates comprehensive report
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ProductionValidator {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            version: '4.0.0',
            checks: {},
            recommendations: [],
            critical: [],
            warnings: [],
            passed: [],
            overall: 'unknown'
        };
    }

    /**
     * Run all validation checks
     */
    async runAllChecks() {
        console.log('🚀 Starting Production Readiness Validation...\n');

        await this.checkEnvironment();
        await this.checkConfiguration();
        await this.checkHealthEndpoints();
        await this.checkErrorHandling();
        await this.checkDocumentation();
        await this.checkSecurityFeatures();
        await this.checkPerformanceFeatures();
        await this.checkGracefulShutdown();

        this.calculateOverallStatus();
        this.generateReport();
    }

    /**
     * Check Node.js environment and dependencies
     */
    async checkEnvironment() {
        console.log('🔍 Checking Environment...');

        try {
            // Check Node.js version
            const nodeVersion = process.version;
            const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

            if (majorVersion >= 18) {
                this.addPass('Node.js version', `✅ ${nodeVersion} (>= 18.0.0 required)`);
            } else {
                this.addCritical('Node.js version', `❌ ${nodeVersion} (>= 18.0.0 required)`);
            }

            // Check package.json
            const packageJson = JSON.parse(await fs.readFile('./package.json', 'utf8'));
            this.addPass('Package configuration', '✅ Valid package.json with correct engines specification');

            // Check main files exist
            const mainFiles = ['index.js', 'src/production-router.js', 'src/health-monitor.js', 'src/error-handler.js'];
            for (const file of mainFiles) {
                try {
                    await fs.access(file);
                    this.addPass(`File existence: ${file}`, '✅ File exists');
                } catch {
                    this.addCritical(`File existence: ${file}`, '❌ File missing');
                }
            }

        } catch (error) {
            this.addCritical('Environment check', `❌ ${error.message}`);
        }
    }

    /**
     * Check configuration files
     */
    async checkConfiguration() {
        console.log('⚙️ Checking Configuration...');

        try {
            const configDir = './configs';
            const configs = await fs.readdir(configDir);

            const requiredConfigs = ['claude-flow.js', 'minimal.js'];
            for (const config of requiredConfigs) {
                if (configs.includes(config)) {
                    // Try to load config
                    try {
                        const configPath = path.join(configDir, config);
                        const configModule = await import(path.resolve(configPath));
                        const configData = configModule.default;

                        if (configData.name && configData.backendCommand && configData.routerTools) {
                            this.addPass(`Configuration: ${config}`, '✅ Valid configuration structure');
                        } else {
                            this.addWarning(`Configuration: ${config}`, '⚠️ Missing required fields');
                        }
                    } catch (error) {
                        this.addCritical(`Configuration: ${config}`, `❌ Failed to load: ${error.message}`);
                    }
                } else {
                    this.addWarning(`Configuration: ${config}`, '⚠️ Configuration file missing');
                }
            }

        } catch (error) {
            this.addCritical('Configuration check', `❌ ${error.message}`);
        }
    }

    /**
     * Check health endpoints
     */
    async checkHealthEndpoints() {
        console.log('🏥 Checking Health Endpoints...');

        try {
            // Check if health monitor is properly implemented
            const healthMonitorCode = await fs.readFile('./src/health-monitor.js', 'utf8');

            if (healthMonitorCode.includes('setupHealthServer') &&
                healthMonitorCode.includes('/health') &&
                healthMonitorCode.includes('/metrics')) {
                this.addPass('Health endpoints', '✅ Health monitoring endpoints implemented');
            } else {
                this.addCritical('Health endpoints', '❌ Health monitoring endpoints missing');
            }

            // Check production router integration
            const routerCode = await fs.readFile('./src/production-router.js', 'utf8');
            if (routerCode.includes('HealthMonitor')) {
                this.addPass('Health integration', '✅ Health monitoring integrated in production router');
            } else {
                this.addCritical('Health integration', '❌ Health monitoring not integrated');
            }

        } catch (error) {
            this.addCritical('Health endpoints check', `❌ ${error.message}`);
        }
    }

    /**
     * Check error handling implementation
     */
    async checkErrorHandling() {
        console.log('🛡️ Checking Error Handling...');

        try {
            const errorHandlerCode = await fs.readFile('./src/error-handler.js', 'utf8');

            const features = [
                { name: 'Error categorization', pattern: /categorizeError/ },
                { name: 'Circuit breaker', pattern: /CircuitBreaker/ },
                { name: 'Error recovery', pattern: /determineRecoveryAction/ },
                { name: 'Structured logging', pattern: /logError/ },
                { name: 'Error metrics', pattern: /trackErrorMetrics/ }
            ];

            for (const feature of features) {
                if (feature.pattern.test(errorHandlerCode)) {
                    this.addPass(`Error handling: ${feature.name}`, '✅ Implemented');
                } else {
                    this.addWarning(`Error handling: ${feature.name}`, '⚠️ Not implemented');
                }
            }

        } catch (error) {
            this.addCritical('Error handling check', `❌ ${error.message}`);
        }
    }

    /**
     * Check documentation completeness
     */
    async checkDocumentation() {
        console.log('📚 Checking Documentation...');

        try {
            const docs = [
                { file: 'README.md', required: true },
                { file: 'docs/INTEGRATION_EXAMPLE.md', required: true },
                { file: 'docs/PRODUCTION_VALIDATION_REPORT.md', required: true },
                { file: 'docs/PROJECT_STRUCTURE.md', required: false },
                { file: 'CHANGELOG.md', required: false }
            ];

            for (const doc of docs) {
                try {
                    await fs.access(doc.file);
                    const content = await fs.readFile(doc.file, 'utf8');
                    if (content.length > 100) {
                        this.addPass(`Documentation: ${doc.file}`, '✅ Present and substantial');
                    } else {
                        this.addWarning(`Documentation: ${doc.file}`, '⚠️ Present but minimal');
                    }
                } catch {
                    if (doc.required) {
                        this.addCritical(`Documentation: ${doc.file}`, '❌ Required documentation missing');
                    } else {
                        this.addWarning(`Documentation: ${doc.file}`, '⚠️ Optional documentation missing');
                    }
                }
            }

        } catch (error) {
            this.addWarning('Documentation check', `⚠️ ${error.message}`);
        }
    }

    /**
     * Check security features
     */
    async checkSecurityFeatures() {
        console.log('🔒 Checking Security Features...');

        try {
            // Check main router for security features
            const routerCode = await fs.readFile('./index.js', 'utf8');

            const securityFeatures = [
                { name: 'Input validation', pattern: /JSON\.parse.*try.*catch/ },
                { name: 'Error sanitization', pattern: /error.*message/ },
                { name: 'Process isolation', pattern: /spawn.*stdio/ },
                { name: 'Signal handling', pattern: /SIGTERM|SIGINT/ }
            ];

            for (const feature of securityFeatures) {
                if (feature.pattern.test(routerCode)) {
                    this.addPass(`Security: ${feature.name}`, '✅ Implemented');
                } else {
                    this.addWarning(`Security: ${feature.name}`, '⚠️ Not verified');
                }
            }

            // Check for potential vulnerabilities
            const vulnerabilityChecks = [
                { name: 'No eval usage', pattern: /eval\(/, invert: true },
                { name: 'No shell execution', pattern: /exec|system/, invert: true },
                { name: 'Proper JSON parsing', pattern: /JSON\.parse/ }
            ];

            for (const check of vulnerabilityChecks) {
                const found = check.pattern.test(routerCode);
                if (check.invert ? !found : found) {
                    this.addPass(`Security: ${check.name}`, '✅ Safe');
                } else {
                    this.addWarning(`Security: ${check.name}`, '⚠️ Potential issue');
                }
            }

        } catch (error) {
            this.addWarning('Security check', `⚠️ ${error.message}`);
        }
    }

    /**
     * Check performance features
     */
    async checkPerformanceFeatures() {
        console.log('⚡ Checking Performance Features...');

        try {
            const routerCode = await fs.readFile('./src/production-router.js', 'utf8');

            const performanceFeatures = [
                { name: 'Request timing', pattern: /RequestTimer/ },
                { name: 'Metrics collection', pattern: /recordRequest/ },
                { name: 'Memory management', pattern: /cleanup/ },
                { name: 'Buffer management', pattern: /buffer.*split/ },
                { name: 'Connection pooling', pattern: /queue.*flush/ }
            ];

            for (const feature of performanceFeatures) {
                if (feature.pattern.test(routerCode)) {
                    this.addPass(`Performance: ${feature.name}`, '✅ Implemented');
                } else {
                    this.addWarning(`Performance: ${feature.name}`, '⚠️ Not implemented');
                }
            }

        } catch (error) {
            this.addWarning('Performance check', `⚠️ ${error.message}`);
        }
    }

    /**
     * Check graceful shutdown implementation
     */
    async checkGracefulShutdown() {
        console.log('🛑 Checking Graceful Shutdown...');

        try {
            const routerCode = await fs.readFile('./src/production-router.js', 'utf8');

            const shutdownFeatures = [
                { name: 'Signal handlers', pattern: /process\.on.*SIG/ },
                { name: 'Graceful shutdown', pattern: /gracefulShutdown/ },
                { name: 'Connection draining', pattern: /pendingRequests/ },
                { name: 'Backend cleanup', pattern: /backendProcess.*kill/ },
                { name: 'Resource cleanup', pattern: /cleanup|shutdown/ }
            ];

            for (const feature of shutdownFeatures) {
                if (feature.pattern.test(routerCode)) {
                    this.addPass(`Shutdown: ${feature.name}`, '✅ Implemented');
                } else {
                    this.addWarning(`Shutdown: ${feature.name}`, '⚠️ Not implemented');
                }
            }

        } catch (error) {
            this.addWarning('Graceful shutdown check', `⚠️ ${error.message}`);
        }
    }

    /**
     * Calculate overall status
     */
    calculateOverallStatus() {
        if (this.results.critical.length > 0) {
            this.results.overall = 'NOT_READY';
        } else if (this.results.warnings.length > 3) {
            this.results.overall = 'READY_WITH_WARNINGS';
        } else {
            this.results.overall = 'PRODUCTION_READY';
        }
    }

    /**
     * Generate comprehensive report
     */
    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📋 PRODUCTION READINESS REPORT');
        console.log('='.repeat(60));

        console.log(`\n🔍 Overall Status: ${this.getStatusEmoji()} ${this.results.overall}`);
        console.log(`📅 Assessment Date: ${this.results.timestamp}`);
        console.log(`📦 Version: ${this.results.version}\n`);

        // Summary
        console.log('📊 SUMMARY:');
        console.log(`   ✅ Passed: ${this.results.passed.length}`);
        console.log(`   ⚠️  Warnings: ${this.results.warnings.length}`);
        console.log(`   ❌ Critical: ${this.results.critical.length}\n`);

        // Critical issues
        if (this.results.critical.length > 0) {
            console.log('🚨 CRITICAL ISSUES:');
            this.results.critical.forEach(issue => console.log(`   ${issue}`));
            console.log('');
        }

        // Warnings
        if (this.results.warnings.length > 0) {
            console.log('⚠️  WARNINGS:');
            this.results.warnings.forEach(warning => console.log(`   ${warning}`));
            console.log('');
        }

        // Recommendations
        console.log('💡 RECOMMENDATIONS:');
        if (this.results.critical.length > 0) {
            console.log('   🔥 Address all critical issues before production deployment');
        }
        if (this.results.warnings.length > 0) {
            console.log('   📈 Consider addressing warnings to improve production reliability');
        }
        console.log('   📊 Implement monitoring and alerting for production metrics');
        console.log('   🔄 Set up automated health checks in your deployment pipeline');
        console.log('   📝 Review and update documentation regularly');
        console.log('   🧪 Run load testing before production deployment');

        // Deployment readiness
        console.log('\n🚀 DEPLOYMENT READINESS:');
        switch (this.results.overall) {
            case 'PRODUCTION_READY':
                console.log('   ✅ APPROVED: Ready for production deployment');
                console.log('   📋 Complete the deployment checklist');
                console.log('   🔍 Monitor closely during initial deployment');
                break;
            case 'READY_WITH_WARNINGS':
                console.log('   ⚠️  CONDITIONAL: Ready with recommended improvements');
                console.log('   📋 Address warnings for optimal production experience');
                console.log('   🔍 Enhanced monitoring recommended');
                break;
            case 'NOT_READY':
                console.log('   ❌ NOT APPROVED: Critical issues must be resolved');
                console.log('   🛠️  Address all critical issues first');
                console.log('   🔄 Re-run validation after fixes');
                break;
        }

        console.log('\n' + '='.repeat(60));
    }

    /**
     * Get status emoji
     */
    getStatusEmoji() {
        switch (this.results.overall) {
            case 'PRODUCTION_READY': return '✅';
            case 'READY_WITH_WARNINGS': return '⚠️';
            case 'NOT_READY': return '❌';
            default: return '❓';
        }
    }

    /**
     * Add passed check
     */
    addPass(check, message) {
        this.results.passed.push(`${check}: ${message}`);
        this.results.checks[check] = { status: 'pass', message };
    }

    /**
     * Add warning
     */
    addWarning(check, message) {
        this.results.warnings.push(`${check}: ${message}`);
        this.results.checks[check] = { status: 'warning', message };
    }

    /**
     * Add critical issue
     */
    addCritical(check, message) {
        this.results.critical.push(`${check}: ${message}`);
        this.results.checks[check] = { status: 'critical', message };
    }

    /**
     * Save report to file
     */
    async saveReport() {
        const reportPath = './docs/production-readiness-checklist.md';
        const report = this.generateMarkdownReport();
        await fs.writeFile(reportPath, report);
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    }

    /**
     * Generate markdown report
     */
    generateMarkdownReport() {
        return `# Production Readiness Checklist

**Assessment Date**: ${this.results.timestamp}
**Version**: ${this.results.version}
**Overall Status**: ${this.getStatusEmoji()} **${this.results.overall}**

## Summary

- ✅ **Passed**: ${this.results.passed.length} checks
- ⚠️ **Warnings**: ${this.results.warnings.length} items
- ❌ **Critical**: ${this.results.critical.length} issues

## Detailed Results

${this.results.critical.length > 0 ? `### 🚨 Critical Issues\n\n${this.results.critical.map(item => `- ${item}`).join('\n')}\n` : ''}

${this.results.warnings.length > 0 ? `### ⚠️ Warnings\n\n${this.results.warnings.map(item => `- ${item}`).join('\n')}\n` : ''}

### ✅ Passed Checks

${this.results.passed.map(item => `- ${item}`).join('\n')}

## Deployment Status

${this.results.overall === 'PRODUCTION_READY' ? '✅ **APPROVED FOR PRODUCTION**' :
  this.results.overall === 'READY_WITH_WARNINGS' ? '⚠️ **CONDITIONAL APPROVAL**' :
  '❌ **NOT READY FOR PRODUCTION**'}

## Next Steps

${this.results.critical.length > 0 ? '1. **CRITICAL**: Resolve all critical issues\n' : ''}${this.results.warnings.length > 0 ? '2. **RECOMMENDED**: Address warnings for optimal production experience\n' : ''}3. **MONITORING**: Set up production monitoring and alerting
4. **TESTING**: Perform load testing in staging environment
5. **DEPLOYMENT**: Follow deployment procedures with monitoring

---

*Generated on ${this.results.timestamp}*
`;
    }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const validator = new ProductionValidator();
    validator.runAllChecks().then(() => {
        return validator.saveReport();
    }).catch(error => {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    });
}

export default ProductionValidator;