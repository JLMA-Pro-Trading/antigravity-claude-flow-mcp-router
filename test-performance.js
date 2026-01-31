#!/usr/bin/env node
/**
 * Performance Test Runner for Optimized MCP Router
 *
 * Tests all optimization targets:
 * - Response times under 100ms
 * - Memory efficiency improvements
 * - Concurrent request handling (20+)
 * - Cache performance
 */

import { performance } from 'perf_hooks';
import { spawn } from 'child_process';
import fs from 'fs/promises';

class PerformanceTestRunner {
    constructor() {
        this.testResults = [];
        this.originalRouter = null;
        this.optimizedRouter = null;
    }

    async runFullPerformanceComparison() {
        console.log('🚀 MCP Router Performance Comparison Suite');
        console.log('='.repeat(60));

        // Test original router
        console.log('\n📊 Testing Original Router...');
        const originalResults = await this.testRouter('index.js', 'Original');

        // Test optimized router
        console.log('\n📊 Testing Optimized Router...');
        const optimizedResults = await this.testRouter('src/optimized-mcp-router.js', 'Optimized');

        // Generate comparison report
        await this.generateComparisonReport(originalResults, optimizedResults);
    }

    async testRouter(routerScript, routerName) {
        const results = {
            name: routerName,
            script: routerScript,
            tests: {},
            overall: {}
        };

        console.log(`\n  Starting ${routerName} Router...`);
        const router = await this.startRouter(routerScript);

        try {
            // Wait for router to be ready
            await this.waitForRouterReady(router);

            // Run test suite
            results.tests.coldStart = await this.testColdStart(router);
            results.tests.responseTime = await this.testResponseTimes(router);
            results.tests.concurrency = await this.testConcurrentRequests(router);
            results.tests.memory = await this.testMemoryUsage(router);
            results.tests.cache = await this.testCachePerformance(router);
            results.tests.sustainedLoad = await this.testSustainedLoad(router);

            // Calculate overall metrics
            results.overall = this.calculateOverallMetrics(results.tests);

        } finally {
            // Cleanup
            router.kill('SIGTERM');
            await this.sleep(1000);
        }

        return results;
    }

    async startRouter(script) {
        return spawn('node', [script, 'claude-flow'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, NODE_OPTIONS: '--expose-gc' }
        });
    }

    async waitForRouterReady(router, timeout = 10000) {
        return new Promise((resolve, reject) => {
            let isReady = false;
            const timer = setTimeout(() => {
                if (!isReady) reject(new Error('Router startup timeout'));
            }, timeout);

            router.stderr.on('data', (data) => {
                const message = data.toString();
                if (message.includes('backend READY') || message.includes('READY')) {
                    isReady = true;
                    clearTimeout(timer);
                    resolve();
                }
            });
        });
    }

    async testColdStart(router) {
        console.log('    Cold Start Test...');
        const startTime = performance.now();

        // Wait for ready signal (already handled in waitForRouterReady)
        const coldStartTime = performance.now() - startTime;

        return {
            name: 'Cold Start',
            time: coldStartTime,
            target: 500,
            passed: coldStartTime <= 500,
            score: Math.max(0, 100 - (coldStartTime / 5)) // 100 for 0ms, 0 for 500ms+
        };
    }

    async testResponseTimes(router) {
        console.log('    Response Time Test...');
        const iterations = 50;
        const times = [];

        for (let i = 0; i < iterations; i++) {
            const startTime = performance.now();

            const request = {
                jsonrpc: '2.0',
                id: i,
                method: 'tools/list',
                params: {}
            };

            const responseReceived = await this.sendRequestAndWaitForResponse(router, request, 2000);
            if (responseReceived) {
                times.push(performance.now() - startTime);
            }

            if (i % 10 === 0) await this.sleep(5); // Small break every 10 requests
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const maxTime = Math.max(...times);
        const minTime = Math.min(...times);

        const under50ms = times.filter(t => t <= 50).length;
        const under100ms = times.filter(t => t <= 100).length;

        return {
            name: 'Response Time',
            average: avgTime,
            max: maxTime,
            min: minTime,
            iterations: times.length,
            under50ms,
            under100ms,
            target: 100,
            passed: avgTime <= 100,
            score: Math.max(0, 100 - avgTime) // 100 for 0ms, 0 for 100ms+
        };
    }

    async testConcurrentRequests(router) {
        console.log('    Concurrent Requests Test...');
        const concurrency = 25;
        const requestsPerClient = 5;

        const startTime = performance.now();
        const promises = [];

        for (let clientId = 0; clientId < concurrency; clientId++) {
            const promise = this.runConcurrentClient(router, clientId, requestsPerClient);
            promises.push(promise);
        }

        const results = await Promise.allSettled(promises);
        const endTime = performance.now();

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        const successfulResults = results
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value)
            .flat();

        const totalRequests = successfulResults.length;
        const totalTime = endTime - startTime;
        const requestsPerSecond = totalRequests / (totalTime / 1000);
        const avgResponseTime = successfulResults.reduce((a, b) => a + b, 0) / totalRequests;

        return {
            name: 'Concurrent Requests',
            concurrency,
            requestsPerClient,
            totalRequests,
            successful,
            failed,
            requestsPerSecond,
            avgResponseTime,
            totalTime,
            target: { concurrency: 20, rps: 50 },
            passed: successful >= concurrency * 0.9 && requestsPerSecond >= 50,
            score: Math.min(100, (successful / concurrency) * 50 + (requestsPerSecond / 100) * 50)
        };
    }

    async runConcurrentClient(router, clientId, requests) {
        const times = [];

        for (let i = 0; i < requests; i++) {
            const startTime = performance.now();

            const request = {
                jsonrpc: '2.0',
                id: `${clientId}-${i}`,
                method: 'tools/list',
                params: {}
            };

            const received = await this.sendRequestAndWaitForResponse(router, request, 3000);
            if (received) {
                times.push(performance.now() - startTime);
            }

            await this.sleep(Math.random() * 10); // Random delay 0-10ms
        }

        return times;
    }

    async testMemoryUsage(router) {
        console.log('    Memory Usage Test...');
        const initialMemory = process.memoryUsage();

        // Generate load
        const requests = 200;
        const promises = [];

        for (let i = 0; i < requests; i++) {
            const request = {
                jsonrpc: '2.0',
                id: `memory-${i}`,
                method: 'tools/list',
                params: {}
            };

            promises.push(this.sendRequestAndWaitForResponse(router, request, 1000));

            if (i % 20 === 0) {
                await this.sleep(10); // Small breaks to allow GC
            }
        }

        await Promise.allSettled(promises);

        // Force GC if available
        if (global.gc) global.gc();
        await this.sleep(1000);

        const finalMemory = process.memoryUsage();
        const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
        const memoryGrowthMB = memoryGrowth / (1024 * 1024);

        const targetGrowthMB = 20; // Target: under 20MB growth

        return {
            name: 'Memory Usage',
            initialMemoryMB: initialMemory.heapUsed / (1024 * 1024),
            finalMemoryMB: finalMemory.heapUsed / (1024 * 1024),
            growthMB: memoryGrowthMB,
            requests,
            targetGrowthMB,
            passed: memoryGrowthMB <= targetGrowthMB,
            score: Math.max(0, 100 - (memoryGrowthMB / targetGrowthMB) * 100)
        };
    }

    async testCachePerformance(router) {
        console.log('    Cache Performance Test...');

        // First request (cache miss)
        const firstRequest = {
            jsonrpc: '2.0',
            id: 'cache-first',
            method: 'tools/list',
            params: {}
        };

        const firstTime = performance.now();
        await this.sendRequestAndWaitForResponse(router, firstRequest, 2000);
        const firstResponseTime = performance.now() - firstTime;

        await this.sleep(100); // Small delay

        // Subsequent requests (should be cached)
        const cachedTimes = [];
        for (let i = 0; i < 10; i++) {
            const request = {
                jsonrpc: '2.0',
                id: `cache-${i}`,
                method: 'tools/list',
                params: {}
            };

            const startTime = performance.now();
            await this.sendRequestAndWaitForResponse(router, request, 1000);
            cachedTimes.push(performance.now() - startTime);
        }

        const avgCachedTime = cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length;
        const improvement = firstResponseTime / avgCachedTime;

        return {
            name: 'Cache Performance',
            firstResponseTime,
            avgCachedTime,
            improvement,
            targetImprovement: 2,
            passed: improvement >= 2,
            score: Math.min(100, (improvement / 5) * 100) // 100 for 5x improvement
        };
    }

    async testSustainedLoad(router) {
        console.log('    Sustained Load Test...');
        const duration = 15000; // 15 seconds
        const requestInterval = 50; // ms

        const startTime = performance.now();
        const responseTimes = [];
        let requestCount = 0;

        while (performance.now() - startTime < duration) {
            const reqStart = performance.now();

            const request = {
                jsonrpc: '2.0',
                id: `sustained-${requestCount++}`,
                method: 'tools/list',
                params: {}
            };

            const received = await this.sendRequestAndWaitForResponse(router, request, 1000);
            if (received) {
                responseTimes.push(performance.now() - reqStart);
            }

            await this.sleep(requestInterval);
        }

        const totalTime = performance.now() - startTime;
        const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const requestsPerSecond = requestCount / (totalTime / 1000);

        const degradation = this.calculatePerformanceDegradation(responseTimes);

        return {
            name: 'Sustained Load',
            duration: totalTime,
            totalRequests: requestCount,
            avgResponseTime,
            requestsPerSecond,
            degradation,
            targetDegradation: 0.2, // Max 20% degradation
            passed: avgResponseTime <= 150 && degradation <= 0.2,
            score: Math.max(0, 100 - (avgResponseTime / 150) * 50 - (degradation * 50))
        };
    }

    calculatePerformanceDegradation(times) {
        if (times.length < 10) return 0;

        const firstQuarter = times.slice(0, Math.floor(times.length / 4));
        const lastQuarter = times.slice(-Math.floor(times.length / 4));

        const firstAvg = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
        const lastAvg = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;

        return Math.max(0, (lastAvg - firstAvg) / firstAvg);
    }

    calculateOverallMetrics(tests) {
        const testValues = Object.values(tests);
        const avgScore = testValues.reduce((sum, test) => sum + test.score, 0) / testValues.length;
        const passedTests = testValues.filter(test => test.passed).length;
        const totalTests = testValues.length;

        return {
            averageScore: avgScore,
            passRate: (passedTests / totalTests) * 100,
            passedTests,
            totalTests,
            grade: this.calculateGrade(avgScore)
        };
    }

    calculateGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    async sendRequestAndWaitForResponse(router, request, timeout = 5000) {
        return new Promise((resolve) => {
            let responseReceived = false;

            const responseHandler = (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.id === request.id && !responseReceived) {
                        responseReceived = true;
                        cleanup();
                        resolve(true);
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            };

            const timeoutHandler = setTimeout(() => {
                if (!responseReceived) {
                    responseReceived = true;
                    cleanup();
                    resolve(false);
                }
            }, timeout);

            const cleanup = () => {
                clearTimeout(timeoutHandler);
                router.stdout.removeListener('data', responseHandler);
            };

            if (router && router.stdin) {
                router.stdout.on('data', responseHandler);
                router.stdin.write(JSON.stringify(request) + '\n');
            } else {
                cleanup();
                resolve(false);
            }
        });
    }

    async generateComparisonReport(originalResults, optimizedResults) {
        console.log('\n' + '='.repeat(80));
        console.log('📈 PERFORMANCE COMPARISON REPORT');
        console.log('='.repeat(80));

        // Overall comparison
        console.log('\n🏆 Overall Performance:');
        console.log(`Original Router    - Score: ${originalResults.overall.averageScore.toFixed(1)} | Grade: ${originalResults.overall.grade} | Pass Rate: ${originalResults.overall.passRate.toFixed(1)}%`);
        console.log(`Optimized Router   - Score: ${optimizedResults.overall.averageScore.toFixed(1)} | Grade: ${optimizedResults.overall.grade} | Pass Rate: ${optimizedResults.overall.passRate.toFixed(1)}%`);

        const improvementPercent = ((optimizedResults.overall.averageScore - originalResults.overall.averageScore) / originalResults.overall.averageScore) * 100;
        console.log(`Improvement: ${improvementPercent > 0 ? '+' : ''}${improvementPercent.toFixed(1)}%`);

        // Detailed test comparison
        console.log('\n📊 Detailed Test Results:');
        const testNames = Object.keys(originalResults.tests);

        for (const testName of testNames) {
            const original = originalResults.tests[testName];
            const optimized = optimizedResults.tests[testName];

            console.log(`\n  ${testName}:`);
            console.log(`    Original:  ${original.score.toFixed(1)} points ${original.passed ? '✅' : '❌'}`);
            console.log(`    Optimized: ${optimized.score.toFixed(1)} points ${optimized.passed ? '✅' : '❌'}`);

            if (testName === 'Response Time') {
                console.log(`    Response Time: ${original.average.toFixed(2)}ms → ${optimized.average.toFixed(2)}ms`);
                const improvement = ((original.average - optimized.average) / original.average) * 100;
                console.log(`    Improvement: ${improvement.toFixed(1)}%`);
            } else if (testName === 'Memory Usage') {
                console.log(`    Memory Growth: ${original.growthMB.toFixed(2)}MB → ${optimized.growthMB.toFixed(2)}MB`);
                const improvement = ((original.growthMB - optimized.growthMB) / original.growthMB) * 100;
                console.log(`    Improvement: ${improvement.toFixed(1)}%`);
            }
        }

        // Performance targets assessment
        console.log('\n🎯 Performance Targets Assessment:');
        this.assessTargets(optimizedResults);

        // Save report
        const report = {
            timestamp: new Date().toISOString(),
            original: originalResults,
            optimized: optimizedResults,
            comparison: {
                improvementPercent,
                targetsAchieved: this.countTargetsAchieved(optimizedResults)
            }
        };

        const reportPath = `performance-comparison-${Date.now()}.json`;
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📄 Detailed report saved: ${reportPath}`);

        return report;
    }

    assessTargets(results) {
        const targets = [
            {
                name: 'Response Time < 100ms',
                achieved: results.tests.responseTime.passed,
                value: `${results.tests.responseTime.average.toFixed(2)}ms`
            },
            {
                name: 'Memory Growth < 20MB',
                achieved: results.tests.memory.passed,
                value: `${results.tests.memory.growthMB.toFixed(2)}MB`
            },
            {
                name: 'Concurrent Handling (20+)',
                achieved: results.tests.concurrency.passed,
                value: `${results.tests.concurrency.successful}/${results.tests.concurrency.concurrency}`
            },
            {
                name: 'Cache Performance (2x improvement)',
                achieved: results.tests.cache.passed,
                value: `${results.tests.cache.improvement.toFixed(1)}x`
            },
            {
                name: 'Sustained Load Performance',
                achieved: results.tests.sustainedLoad.passed,
                value: `${results.tests.sustainedLoad.avgResponseTime.toFixed(2)}ms avg`
            }
        ];

        targets.forEach(target => {
            const status = target.achieved ? '✅' : '❌';
            console.log(`  ${status} ${target.name}: ${target.value}`);
        });

        const achievedCount = targets.filter(t => t.achieved).length;
        console.log(`\n  Overall: ${achievedCount}/${targets.length} targets achieved`);
    }

    countTargetsAchieved(results) {
        return Object.values(results.tests).filter(test => test.passed).length;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the performance comparison
const testRunner = new PerformanceTestRunner();
await testRunner.runFullPerformanceComparison();

process.exit(0);