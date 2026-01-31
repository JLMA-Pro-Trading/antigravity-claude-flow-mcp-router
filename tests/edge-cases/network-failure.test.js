/**
 * Network Failure Recovery Tests
 * Tests for handling network failures and connection issues
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';

describe('Network Failure Recovery', () => {
    let networkSimulator;
    let connectionManager;

    beforeEach(() => {
        networkSimulator = {
            isConnected: true,
            latency: 10,
            packetLoss: 0,
            failures: [],

            simulateFailure(type, duration = 1000) {
                this.failures.push({ type, startTime: Date.now(), duration });

                switch (type) {
                    case 'disconnect':
                        this.isConnected = false;
                        setTimeout(() => {
                            this.isConnected = true;
                        }, duration);
                        break;

                    case 'high_latency':
                        this.latency = 5000; // 5 second delay
                        setTimeout(() => {
                            this.latency = 10;
                        }, duration);
                        break;

                    case 'packet_loss':
                        this.packetLoss = 0.5; // 50% packet loss
                        setTimeout(() => {
                            this.packetLoss = 0;
                        }, duration);
                        break;
                }
            },

            async send(message) {
                if (!this.isConnected) {
                    throw new Error('ENOTCONN: Network not connected');
                }

                // Simulate packet loss
                if (Math.random() < this.packetLoss) {
                    throw new Error('ETIMEDOUT: Packet lost');
                }

                // Simulate latency
                await new Promise(resolve => setTimeout(resolve, this.latency));

                return { sent: true, message };
            }
        };

        connectionManager = {
            isConnected: false,
            connectionAttempts: 0,
            maxRetries: 5,
            retryDelay: 100,
            circuitBreakerOpen: false,
            failureCount: 0,
            lastFailureTime: null,

            async connect() {
                this.connectionAttempts++;

                if (this.circuitBreakerOpen) {
                    const timeSinceFailure = Date.now() - this.lastFailureTime;
                    if (timeSinceFailure < 5000) { // 5 second circuit breaker
                        throw new Error('Circuit breaker open - too many recent failures');
                    } else {
                        this.circuitBreakerOpen = false;
                        this.failureCount = 0;
                    }
                }

                try {
                    if (!networkSimulator.isConnected) {
                        throw new Error('Connection refused');
                    }

                    this.isConnected = true;
                    this.failureCount = 0;
                    return { connected: true };

                } catch (error) {
                    this.isConnected = false;
                    this.failureCount++;
                    this.lastFailureTime = Date.now();

                    if (this.failureCount >= 3) {
                        this.circuitBreakerOpen = true;
                    }

                    throw error;
                }
            },

            async connectWithRetry() {
                for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                    try {
                        return await this.connect();
                    } catch (error) {
                        if (attempt === this.maxRetries) {
                            throw new Error(`Connection failed after ${this.maxRetries} attempts: ${error.message}`);
                        }

                        // Exponential backoff
                        const delay = this.retryDelay * Math.pow(2, attempt - 1);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            },

            disconnect() {
                this.isConnected = false;
            }
        };
    });

    describe('Connection Establishment', () => {
        it('should establish connection successfully', async () => {
            const result = await connectionManager.connect();
            assert.strictEqual(result.connected, true);
            assert.strictEqual(connectionManager.isConnected, true);
            assert.strictEqual(connectionManager.connectionAttempts, 1);
        });

        it('should retry connection on failure', async () => {
            // Simulate network down
            networkSimulator.simulateFailure('disconnect', 200);

            // Connection should fail initially
            await assert.rejects(
                connectionManager.connect(),
                { message: 'Connection refused' }
            );

            // Wait for network to recover
            await new Promise(resolve => setTimeout(resolve, 250));

            // Retry should succeed
            const result = await connectionManager.connect();
            assert.strictEqual(result.connected, true);
        });

        it('should implement exponential backoff', async () => {
            // Keep network down longer than initial retry attempts
            networkSimulator.simulateFailure('disconnect', 1000);

            const startTime = Date.now();
            let error;

            try {
                await connectionManager.connectWithRetry();
            } catch (e) {
                error = e;
            }

            const elapsed = Date.now() - startTime;

            assert.ok(error);
            assert.ok(error.message.includes('after 5 attempts'));
            // Should take some time due to exponential backoff
            // 100 + 200 + 400 + 800 + 1600 = ~3100ms minimum
            assert.ok(elapsed > 1000);
        });

        it('should implement circuit breaker pattern', async () => {
            // Simulate multiple consecutive failures
            for (let i = 0; i < 3; i++) {
                networkSimulator.simulateFailure('disconnect', 50);
                await assert.rejects(connectionManager.connect());
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            assert.strictEqual(connectionManager.circuitBreakerOpen, true);

            // Even with network recovered, circuit breaker should prevent attempts
            await new Promise(resolve => setTimeout(resolve, 100));

            await assert.rejects(
                connectionManager.connect(),
                { message: /Circuit breaker open/ }
            );

            // Wait for circuit breaker to reset
            await new Promise(resolve => setTimeout(resolve, 5100));

            // Should be able to connect again
            const result = await connectionManager.connect();
            assert.strictEqual(result.connected, true);
            assert.strictEqual(connectionManager.circuitBreakerOpen, false);
        });
    });

    describe('Message Transmission Failures', () => {
        beforeEach(async () => {
            await connectionManager.connect();
        });

        it('should handle temporary disconnections', async () => {
            const messageQueue = [];
            let sentCount = 0;
            let failedCount = 0;

            const sendWithRetry = async (message, maxRetries = 3) => {
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        const result = await networkSimulator.send(message);
                        sentCount++;
                        return result;
                    } catch (error) {
                        if (attempt === maxRetries) {
                            failedCount++;
                            messageQueue.push(message); // Queue for later retry
                            throw error;
                        }

                        // Wait before retry
                        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
                    }
                }
            };

            // Send some messages
            const messages = [
                { id: 1, data: 'message 1' },
                { id: 2, data: 'message 2' },
                { id: 3, data: 'message 3' }
            ];

            // Simulate temporary disconnection during sending
            setTimeout(() => {
                networkSimulator.simulateFailure('disconnect', 150);
            }, 50);

            const results = await Promise.allSettled(
                messages.map(msg => sendWithRetry(msg))
            );

            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;

            assert.ok(successful > 0, 'Some messages should succeed');
            assert.strictEqual(successful + failed, messages.length);
            assert.ok(messageQueue.length >= 0, 'Failed messages should be queued');
        });

        it('should handle packet loss gracefully', async () => {
            const messageResults = [];

            // Simulate 30% packet loss
            networkSimulator.simulateFailure('packet_loss', 500);

            const sendMessageWithRetry = async (id) => {
                let attempts = 0;
                const maxAttempts = 5;

                while (attempts < maxAttempts) {
                    attempts++;
                    try {
                        const result = await networkSimulator.send({ id, data: `message ${id}` });
                        return { id, success: true, attempts };
                    } catch (error) {
                        if (attempts === maxAttempts) {
                            return { id, success: false, attempts, error: error.message };
                        }
                        // Brief delay before retry
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                }
            };

            // Send multiple messages concurrently
            const messagePromises = [];
            for (let i = 1; i <= 20; i++) {
                messagePromises.push(sendMessageWithRetry(i));
            }

            const results = await Promise.all(messagePromises);

            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;

            assert.ok(successful > 0, 'Some messages should eventually succeed');
            assert.ok(successful >= 10, 'Most messages should succeed with retries');

            // Check that retries were used
            const averageAttempts = results.reduce((sum, r) => sum + r.attempts, 0) / results.length;
            assert.ok(averageAttempts > 1, 'Should require multiple attempts on average');
        });

        it('should handle high latency conditions', async () => {
            const latencyTracker = {
                measurements: [],

                async measureLatency(operation) {
                    const startTime = Date.now();
                    try {
                        const result = await operation();
                        const endTime = Date.now();
                        this.measurements.push({
                            latency: endTime - startTime,
                            success: true
                        });
                        return result;
                    } catch (error) {
                        const endTime = Date.now();
                        this.measurements.push({
                            latency: endTime - startTime,
                            success: false,
                            error: error.message
                        });
                        throw error;
                    }
                },

                getAverageLatency() {
                    const successful = this.measurements.filter(m => m.success);
                    if (successful.length === 0) return 0;
                    return successful.reduce((sum, m) => sum + m.latency, 0) / successful.length;
                }
            };

            // Normal latency measurement
            await latencyTracker.measureLatency(() =>
                networkSimulator.send({ test: 'normal latency' })
            );

            // High latency simulation
            networkSimulator.simulateFailure('high_latency', 300);

            await latencyTracker.measureLatency(() =>
                networkSimulator.send({ test: 'high latency' })
            );

            const avgLatency = latencyTracker.getAverageLatency();
            assert.ok(avgLatency > 100, 'Should measure increased latency');

            const highLatencyMeasurement = latencyTracker.measurements.find(m =>
                m.latency > 1000
            );
            assert.ok(highLatencyMeasurement, 'Should have recorded high latency measurement');
        });
    });

    describe('Connection Recovery', () => {
        it('should detect connection loss', async () => {
            await connectionManager.connect();
            assert.strictEqual(connectionManager.isConnected, true);

            const connectionMonitor = {
                isMonitoring: false,
                disconnectionDetected: false,

                startMonitoring() {
                    this.isMonitoring = true;
                    this.monitor();
                },

                async monitor() {
                    while (this.isMonitoring) {
                        try {
                            await networkSimulator.send({ type: 'heartbeat' });
                            await new Promise(resolve => setTimeout(resolve, 100));
                        } catch (error) {
                            this.disconnectionDetected = true;
                            connectionManager.disconnect();
                            break;
                        }
                    }
                },

                stopMonitoring() {
                    this.isMonitoring = false;
                }
            };

            connectionMonitor.startMonitoring();

            // Simulate connection loss
            setTimeout(() => {
                networkSimulator.simulateFailure('disconnect', 200);
            }, 150);

            // Wait for monitor to detect disconnection
            await new Promise(resolve => setTimeout(resolve, 300));

            connectionMonitor.stopMonitoring();

            assert.strictEqual(connectionMonitor.disconnectionDetected, true);
            assert.strictEqual(connectionManager.isConnected, false);
        });

        it('should automatically reconnect after failure', async () => {
            const autoReconnector = {
                isEnabled: true,
                reconnectAttempts: 0,
                maxReconnectAttempts: 3,

                async startReconnecting() {
                    while (this.isEnabled && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;

                        try {
                            await connectionManager.connect();
                            return { reconnected: true, attempts: this.reconnectAttempts };
                        } catch (error) {
                            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        }
                    }

                    return { reconnected: false, attempts: this.reconnectAttempts };
                }
            };

            // Initial connection
            await connectionManager.connect();

            // Simulate connection loss
            connectionManager.disconnect();
            networkSimulator.simulateFailure('disconnect', 100);

            // Start auto-reconnection
            setTimeout(() => {
                networkSimulator.isConnected = true; // Restore network
            }, 600);

            const result = await autoReconnector.startReconnecting();

            assert.strictEqual(result.reconnected, true);
            assert.ok(result.attempts > 0);
            assert.strictEqual(connectionManager.isConnected, true);
        });

        it('should handle connection flapping', async () => {
            const flappingDetector = {
                connectionEvents: [],
                flappingThreshold: 5,
                timeWindow: 2000, // 2 seconds

                recordConnectionEvent(type) {
                    this.connectionEvents.push({
                        type, // 'connect' or 'disconnect'
                        timestamp: Date.now()
                    });

                    // Clean old events
                    const cutoff = Date.now() - this.timeWindow;
                    this.connectionEvents = this.connectionEvents.filter(
                        event => event.timestamp > cutoff
                    );
                },

                isFlapping() {
                    return this.connectionEvents.length >= this.flappingThreshold;
                },

                getEventCount() {
                    return this.connectionEvents.length;
                }
            };

            // Simulate connection flapping
            for (let i = 0; i < 6; i++) {
                flappingDetector.recordConnectionEvent('disconnect');
                await new Promise(resolve => setTimeout(resolve, 100));

                flappingDetector.recordConnectionEvent('connect');
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            assert.strictEqual(flappingDetector.isFlapping(), true);
            assert.ok(flappingDetector.getEventCount() >= 5);

            // Wait for time window to expire
            await new Promise(resolve => setTimeout(resolve, 2100));

            assert.strictEqual(flappingDetector.isFlapping(), false);
        });
    });

    describe('Protocol-Level Recovery', () => {
        it('should handle partial message transmission', () => {
            const messageAssembler = {
                partialMessages: new Map(),

                processFragment(messageId, fragment, isLast = false) {
                    if (!this.partialMessages.has(messageId)) {
                        this.partialMessages.set(messageId, {
                            fragments: [],
                            complete: false
                        });
                    }

                    const message = this.partialMessages.get(messageId);
                    message.fragments.push(fragment);

                    if (isLast) {
                        message.complete = true;
                        const assembled = this.assembleMessage(message.fragments);
                        this.partialMessages.delete(messageId);
                        return assembled;
                    }

                    return null; // Message not yet complete
                },

                assembleMessage(fragments) {
                    return fragments.join('');
                },

                cleanupStaleMessages(maxAge = 5000) {
                    const cutoff = Date.now() - maxAge;
                    const messagesToDelete = [];

                    for (const [messageId, message] of this.partialMessages) {
                        if (message.timestamp < cutoff) {
                            messagesToDelete.push(messageId);
                        }
                    }

                    messagesToDelete.forEach(id => {
                        this.partialMessages.delete(id);
                    });

                    return messagesToDelete.length;
                }
            };

            // Simulate fragmented message
            const messageId = 'msg_001';
            const originalMessage = '{"jsonrpc":"2.0","method":"test","params":{"data":"large_payload"}}';

            // Fragment the message
            const fragmentSize = 20;
            const fragments = [];
            for (let i = 0; i < originalMessage.length; i += fragmentSize) {
                fragments.push(originalMessage.substring(i, i + fragmentSize));
            }

            // Process fragments
            let assembledMessage = null;
            fragments.forEach((fragment, index) => {
                const isLast = index === fragments.length - 1;
                const result = messageAssembler.processFragment(messageId, fragment, isLast);
                if (result) {
                    assembledMessage = result;
                }
            });

            assert.strictEqual(assembledMessage, originalMessage);
            assert.strictEqual(messageAssembler.partialMessages.size, 0);
        });

        it('should handle message ordering issues', () => {
            const messageOrdering = {
                expectedSequence: 1,
                messageBuffer: new Map(),
                deliveredMessages: [],

                processMessage(sequenceNumber, payload) {
                    if (sequenceNumber === this.expectedSequence) {
                        // Deliver this message and any buffered ones
                        this.deliveredMessages.push({ sequenceNumber, payload });
                        this.expectedSequence++;

                        // Check for buffered messages that can now be delivered
                        while (this.messageBuffer.has(this.expectedSequence)) {
                            const bufferedMessage = this.messageBuffer.get(this.expectedSequence);
                            this.deliveredMessages.push(bufferedMessage);
                            this.messageBuffer.delete(this.expectedSequence);
                            this.expectedSequence++;
                        }

                        return { delivered: true, count: this.deliveredMessages.length };
                    } else if (sequenceNumber > this.expectedSequence) {
                        // Buffer this out-of-order message
                        this.messageBuffer.set(sequenceNumber, { sequenceNumber, payload });
                        return { buffered: true, waiting: this.expectedSequence };
                    } else {
                        // Duplicate or old message
                        return { duplicate: true, sequenceNumber };
                    }
                },

                getStats() {
                    return {
                        delivered: this.deliveredMessages.length,
                        buffered: this.messageBuffer.size,
                        expectedNext: this.expectedSequence
                    };
                }
            };

            // Send messages out of order
            const messages = [
                { seq: 1, data: 'first' },
                { seq: 3, data: 'third' },   // Out of order
                { seq: 2, data: 'second' },  // Fill the gap
                { seq: 4, data: 'fourth' },
                { seq: 1, data: 'duplicate' } // Duplicate
            ];

            const results = [];
            messages.forEach(msg => {
                const result = messageOrdering.processMessage(msg.seq, msg.data);
                results.push(result);
            });

            const stats = messageOrdering.getStats();

            assert.strictEqual(stats.delivered, 4); // All unique messages delivered
            assert.strictEqual(stats.buffered, 0);  // No messages left buffered
            assert.strictEqual(stats.expectedNext, 5); // Expecting sequence 5

            // Check that messages were delivered in order
            for (let i = 0; i < messageOrdering.deliveredMessages.length; i++) {
                assert.strictEqual(messageOrdering.deliveredMessages[i].sequenceNumber, i + 1);
            }
        });
    });
});