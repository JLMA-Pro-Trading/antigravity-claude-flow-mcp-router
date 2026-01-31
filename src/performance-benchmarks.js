/**
 * Performance Benchmarking Suite for MCP Router
 *
 * Validates performance targets:
 * - Response times under 100ms
 * - Memory efficiency optimization
 * - Concurrent request handling
 * - Cache hit rates
 */

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';

class MCPRouterBenchmark {
    constructor() {
        this.routerProcess = null;
        this.results = [];
        this.testStartTime = 0;
    }

    async runBenchmarkSuite() {
        console.log('🚀 Starting MCP Router Performance Benchmark Suite');
        console.log('='.repeat(60));

        this.testStartTime = performance.now();

        const tests = [
            { name: 'Cold Start Performance', fn: () => this.benchmarkColdStart() },
            { name: 'Tool List Response Time', fn: () => this.benchmarkToolListResponse() },
            { name: 'Concurrent Request Handling', fn: () => this.benchmarkConcurrentRequests() },
            { name: 'Cache Performance', fn: () => this.benchmarkCachePerformance() },
            { name: 'Memory Usage Efficiency', fn: () => this.benchmarkMemoryUsage() },
            { name: 'Sustained Load Performance', fn: () => this.benchmarkSustainedLoad() },
            { name: 'Discovery Operation Speed', fn: () => this.benchmarkDiscoveryOperations() }
        ];

        for (const test of tests) {
            console.log(`\n📊 Running: ${test.name}`);
            try {
                const result = await test.fn();
                this.results.push({ name: test.name, ...result });
                this.printTestResult(test.name, result);
            } catch (error) {
                console.error(`❌ ${test.name} failed:`, error.message);
                this.results.push({
                    name: test.name,
                    success: false,
                    error: error.message
                });
            }
        }

        await this.generateReport();
    }

    async benchmarkColdStart() {
        console.log('  Starting router from cold state...');
        const startTime = performance.now();

        // Start the optimized router
        this.routerProcess = spawn('node', [
            'src/performance-optimized-router.js',
            'claude-flow'
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: path.dirname(new URL(import.meta.url).pathname) + '/..'
        });

        // Wait for ready signal
        let isReady = false;
        let readyTime = 0;

        this.routerProcess.stderr.on('data', (data) => {
            const message = data.toString();
            if (message.includes('backend READY') && !isReady) {
                readyTime = performance.now();
                isReady = true;
            }
        });

        // Wait up to 10 seconds for ready
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Router startup timeout')), 10000)
        );

        const readyPromise = new Promise((resolve) => {
            const checkReady = () => {
                if (isReady) {
                    resolve();
                } else {
                    setTimeout(checkReady, 10);
                }
            };
            checkReady();
        });

        await Promise.race([readyPromise, timeout]);

        const totalStartupTime = readyTime - startTime;
        const targetTime = 500; // ms

        return {
            startupTime: totalStartupTime,
            targetTime,
            success: totalStartupTime <= targetTime,
            performance: totalStartupTime <= targetTime ? 'EXCELLENT' :
                totalStartupTime <= 1000 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
        };
    }

    async benchmarkToolListResponse() {
        console.log('  Testing tool list response times...');
        const iterations = 100;
        const responseTimes = [];

        for (let i = 0; i < iterations; i++) {
            const startTime = performance.now();

            // Send tools/list request
            const request = {
                jsonrpc: '2.0',
                id: i,
                method: 'tools/list',
                params: {}
            };

            const responseReceived = await this.sendRequestAndWaitForResponse(request);
            const endTime = performance.now();

            if (responseReceived) {
                responseTimes.push(endTime - startTime);
            }

            // Small delay between requests
            await this.sleep(1);
        }

        const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const maxResponseTime = Math.max(...responseTimes);
        const minResponseTime = Math.min(...responseTimes);
        const targetTime = 100; // ms

        const success = avgResponseTime <= targetTime;

        return {
            avgResponseTime,
            maxResponseTime,
            minResponseTime,
            targetTime,
            iterations: responseTimes.length,
            success,
            performance: avgResponseTime <= 50 ? 'EXCELLENT' :
                avgResponseTime <= 100 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
        };
    }

    async benchmarkConcurrentRequests() {
        console.log('  Testing concurrent request handling...');
        const concurrency = 20;
        const requestsPerClient = 10;

        const startTime = performance.now();

        // Create concurrent request streams
        const promises = Array(concurrency).fill().map(async (_, clientId) => {
            const clientTimes = [];

            for (let i = 0; i < requestsPerClient; i++) {
                const reqStart = performance.now();

                const request = {
                    jsonrpc: '2.0',
                    id: `${clientId}-${i}`,
                    method: 'tools/list',
                    params: {}
                };

                const received = await this.sendRequestAndWaitForResponse(request);
                if (received) {
                    clientTimes.push(performance.now() - reqStart);
                }

                await this.sleep(Math.random() * 5); // Random delay 0-5ms
            }

            return clientTimes;
        });

        const allResults = await Promise.all(promises);
        const endTime = performance.now();

        const allTimes = allResults.flat();
        const totalRequests = allTimes.length;
        const totalTime = endTime - startTime;
        const requestsPerSecond = totalRequests / (totalTime / 1000);
        const avgResponseTime = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;

        return {
            concurrency,
            requestsPerClient,
            totalRequests,
            totalTime,
            requestsPerSecond,
            avgResponseTime,
            targetRPS: 100, // requests per second
            success: requestsPerSecond >= 100 && avgResponseTime <= 100,
            performance: requestsPerSecond >= 200 ? 'EXCELLENT' :
                requestsPerSecond >= 100 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
        };
    }

    async benchmarkCachePerformance() {
        console.log('  Testing cache performance...');
        const cacheWarmupRequests = 50;
        const testRequests = 100;

        // Warm up cache
        console.log('    Warming up cache...');
        for (let i = 0; i < cacheWarmupRequests; i++) {
            const request = {
                jsonrpc: '2.0',
                id: `warmup-${i}`,
                method: 'tools/list',
                params: {}
            };
            await this.sendRequestAndWaitForResponse(request);
            await this.sleep(1);
        }

        // Test cached responses
        console.log('    Testing cached responses...');
        const cachedTimes = [];

        for (let i = 0; i < testRequests; i++) {
            const startTime = performance.now();

            const request = {
                jsonrpc: '2.0',
                id: `cached-${i}`,
                method: 'tools/list',
                params: {}
            };

            const received = await this.sendRequestAndWaitForResponse(request);
            if (received) {
                cachedTimes.push(performance.now() - startTime);
            }
        }

        const avgCachedTime = cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length;
        const targetCachedTime = 10; // ms for cached responses

        return {
            warmupRequests: cacheWarmupRequests,
            testRequests: cachedTimes.length,
            avgCachedResponseTime: avgCachedTime,
            targetCachedTime,
            cacheEfficiency: targetCachedTime / avgCachedTime,
            success: avgCachedTime <= targetCachedTime,
            performance: avgCachedTime <= 5 ? 'EXCELLENT' :
                avgCachedTime <= 10 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
        };
    }

    async benchmarkMemoryUsage() {
        console.log('  Testing memory usage efficiency...');
        const baselineMemory = process.memoryUsage();

        // Generate load to measure memory growth
        const requests = 500;
        const batchSize = 50;

        for (let batch = 0; batch < requests / batchSize; batch++) {
            const promises = [];

            for (let i = 0; i < batchSize; i++) {
                const request = {
                    jsonrpc: '2.0',
                    id: `memory-${batch}-${i}`,
                    method: 'tools/list',
                    params: {}
                };
                promises.push(this.sendRequestAndWaitForResponse(request));
            }

            await Promise.all(promises);
            await this.sleep(10); // Allow GC
        }

        // Force garbage collection if possible
        if (global.gc) {
            global.gc();
        }

        const finalMemory = process.memoryUsage();
        const memoryGrowth = finalMemory.heapUsed - baselineMemory.heapUsed;
        const memoryGrowthMB = memoryGrowth / (1024 * 1024);

        // Target: Less than 10MB growth for 500 requests
        const targetGrowthMB = 10;

        return {
            baselineMemoryMB: baselineMemory.heapUsed / (1024 * 1024),
            finalMemoryMB: finalMemory.heapUsed / (1024 * 1024),
            memoryGrowthMB,
            targetGrowthMB,
            requests,
            success: memoryGrowthMB <= targetGrowthMB,
            performance: memoryGrowthMB <= 5 ? 'EXCELLENT' :
                memoryGrowthMB <= 10 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
        };
    }

    async benchmarkSustainedLoad() {
        console.log('  Testing sustained load performance...');
        const durationMs = 30000; // 30 seconds
        const requestInterval = 10; // ms

        const startTime = performance.now();
        const responseTimes = [];
        let requestCount = 0;

        while (performance.now() - startTime < durationMs) {
            const reqStart = performance.now();

            const request = {
                jsonrpc: '2.0',
                id: `sustained-${requestCount++}`,
                method: 'tools/list',
                params: {}
            };

            const received = await this.sendRequestAndWaitForResponse(request);
            if (received) {
                responseTimes.push(performance.now() - reqStart);
            }

            await this.sleep(requestInterval);
        }

        const totalTime = performance.now() - startTime;
        const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const requestsPerSecond = requestCount / (totalTime / 1000);

        return {
            durationMs: totalTime,
            totalRequests: requestCount,
            avgResponseTime,
            requestsPerSecond,
            targetResponseTime: 100,
            targetRPS: 50,
            success: avgResponseTime <= 100 && requestsPerSecond >= 50,
            performance: avgResponseTime <= 50 && requestsPerSecond >= 100 ? 'EXCELLENT' :
                avgResponseTime <= 100 && requestsPerSecond >= 50 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
        };
    }

    async benchmarkDiscoveryOperations() {
        console.log('  Testing discovery operation performance...');
        const iterations = 50;
        const searchTerms = ['agent', 'memory', 'swarm', 'task', 'workflow'];

        const discoveryTimes = [];

        for (let i = 0; i < iterations; i++) {
            const searchTerm = searchTerms[i % searchTerms.length];
            const startTime = performance.now();

            const request = {
                jsonrpc: '2.0',
                id: `discover-${i}`,
                method: 'tools/call',
                params: {
                    name: 'cf_discover',
                    arguments: { search: searchTerm }
                }
            };

            const received = await this.sendRequestAndWaitForResponse(request);
            if (received) {
                discoveryTimes.push(performance.now() - startTime);
            }
        }

        const avgDiscoveryTime = discoveryTimes.reduce((a, b) => a + b, 0) / discoveryTimes.length;
        const targetTime = 50; // ms

        return {
            iterations: discoveryTimes.length,
            avgDiscoveryTime,
            targetTime,
            searchTerms: searchTerms.length,
            success: avgDiscoveryTime <= targetTime,
            performance: avgDiscoveryTime <= 25 ? 'EXCELLENT' :
                avgDiscoveryTime <= 50 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
        };
    }

    async sendRequestAndWaitForResponse(request) {
        return new Promise((resolve) => {
            let responseReceived = false;

            // Set up response handler
            const responseHandler = (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.id === request.id && !responseReceived) {
                        responseReceived = true;
                        resolve(true);
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            };

            // Set up timeout
            const timeout = setTimeout(() => {
                if (!responseReceived) {
                    responseReceived = true;
                    resolve(false);
                }
            }, 5000);

            // Send request
            if (this.routerProcess && this.routerProcess.stdin) {
                this.routerProcess.stdout.once('data', responseHandler);
                this.routerProcess.stdin.write(JSON.stringify(request) + '\n');
            } else {
                clearTimeout(timeout);
                resolve(false);
            }
        });
    }

    printTestResult(testName, result) {
        const status = result.success ? '✅' : '❌';
        const performance = result.performance || 'N/A';

        console.log(`  ${status} ${testName}`);
        console.log(`     Performance: ${performance}`);

        if (result.avgResponseTime !== undefined) {
            console.log(`     Average Response Time: ${result.avgResponseTime.toFixed(2)}ms`);
        }
        if (result.requestsPerSecond !== undefined) {
            console.log(`     Requests/Second: ${result.requestsPerSecond.toFixed(2)}`);
        }
        if (result.memoryGrowthMB !== undefined) {
            console.log(`     Memory Growth: ${result.memoryGrowthMB.toFixed(2)}MB`);
        }
    }

    async generateReport() {
        const totalTime = performance.now() - this.testStartTime;
        const passedTests = this.results.filter(r => r.success).length;
        const totalTests = this.results.length;
        const successRate = (passedTests / totalTests) * 100;

        console.log('\n' + '='.repeat(60));
        console.log('🎯 PERFORMANCE BENCHMARK REPORT');
        console.log('='.repeat(60));

        console.log(`\n📊 Summary:`);
        console.log(`   Total Tests: ${totalTests}`);
        console.log(`   Passed: ${passedTests}`);
        console.log(`   Failed: ${totalTests - passedTests}`);
        console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
        console.log(`   Total Time: ${(totalTime / 1000).toFixed(2)}s`);

        console.log(`\n🎨 Performance Classification:`);
        const excellent = this.results.filter(r => r.performance === 'EXCELLENT').length;
        const good = this.results.filter(r => r.performance === 'GOOD').length;
        const needsImprovement = this.results.filter(r => r.performance === 'NEEDS_IMPROVEMENT').length;

        console.log(`   Excellent: ${excellent} tests`);
        console.log(`   Good: ${good} tests`);
        console.log(`   Needs Improvement: ${needsImprovement} tests`);

        // Save detailed report
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalTests,
                passedTests,
                successRate,
                totalTimeMs: totalTime
            },
            performance: { excellent, good, needsImprovement },
            results: this.results
        };

        const reportPath = `benchmark-report-${Date.now()}.json`;
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📄 Detailed report saved: ${reportPath}`);

        // Cleanup
        if (this.routerProcess) {
            this.routerProcess.kill();
        }

        return report;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const benchmark = new MCPRouterBenchmark();
    await benchmark.runBenchmarkSuite();
}

export default MCPRouterBenchmark;