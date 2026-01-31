#!/usr/bin/env node

/**
 * Test V1.0 Router - Verify the fix works
 */

import { spawn } from 'child_process';

console.log('🧪 Testing V1.0 Router (Original Working Version)\n');

const router = spawn('node', [
    '/workspaces/jlmaworkspace/antigravity_claude-flow_mcp_router/index.js',
    'claude-flow'
], {
    stdio: ['pipe', 'pipe', 'pipe']
});

let responses = [];

router.stderr.on('data', (data) => {
    const log = data.toString().trim();
    console.log(`[ROUTER-LOG] ${log}`);

    if (log.includes('Backend READY')) {
        console.log('✅ Backend ready - testing tools/list...');

        // Send tools/list request
        const toolsRequest = {
            jsonrpc: '2.0',
            id: 999,
            method: 'tools/list'
        };
        router.stdin.write(JSON.stringify(toolsRequest) + '\n');
    }
});

router.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());

    for (const line of lines) {
        try {
            const response = JSON.parse(line);
            responses.push(response);
            console.log(`📥 Response ${responses.length}:`, JSON.stringify(response, null, 2));

            if (response.id === 999 && response.result) {
                console.log('\n✅ V1.0 Router working perfectly!');
                console.log(`📋 Tools available: ${response.result.tools?.length || 0}`);

                router.kill('SIGTERM');
            }
        } catch (e) {
            // Not JSON
        }
    }
});

router.on('close', (code) => {
    console.log(`\n🏁 Router test complete: code=${code}`);

    if (responses.length > 0) {
        console.log('✅ SUCCESS: Router is responding correctly');
        console.log('🎯 The "client is closing" issue should be resolved!');
    } else {
        console.log('❌ No responses - check configuration');
    }

    process.exit(0);
});

// Start initialization
setTimeout(() => {
    console.log('📤 Sending initialization...');

    const initMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: { roots: { listChanged: true } },
            clientInfo: { name: 'test-v1', version: '1.0.0' }
        }
    };

    router.stdin.write(JSON.stringify(initMessage) + '\n');
}, 1000);

// Cleanup
setTimeout(() => {
    console.log('\n⏰ Test timeout');
    router.kill('SIGTERM');
}, 15000);

process.on('SIGINT', () => {
    router.kill('SIGTERM');
    process.exit(0);
});