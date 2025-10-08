/**
 * Test setup and configuration
 */

// Mock fetch for testing
global.fetch = jest.fn();

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Mock AbortSignal.timeout for Node.js environments
if (!global.AbortSignal) {
    global.AbortSignal = {
        timeout: jest.fn(() => new AbortController().signal),
    } as any;
}

// Mock URL for Node.js environments
if (!global.URL) {
    global.URL = require('url').URL;
}

// Mock TextEncoder/TextDecoder for Node.js environments
if (!global.TextEncoder) {
    global.TextEncoder = require('util').TextEncoder;
}

if (!global.TextDecoder) {
    global.TextDecoder = require('util').TextDecoder;
}

// Add a simple test to satisfy Jest requirement
describe('Test Setup', () => {
    it('should have proper test environment', () => {
        expect(global.fetch).toBeDefined();
        expect(global.console).toBeDefined();
    });
});
