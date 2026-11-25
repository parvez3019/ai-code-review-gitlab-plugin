const http = require('node:http');

/**
 * Start a throwaway HTTP server. `handler(req, body)` returns
 * {status?, body?, headers?}; every request is recorded in `requests`.
 */
function fakeServer(handler) {
    return new Promise((resolve) => {
        const requests = [];
        const server = http.createServer((req, res) => {
            let raw = '';
            req.on('data', (c) => (raw += c));
            req.on('end', async () => {
                let body;
                try {
                    body = raw ? JSON.parse(raw) : undefined;
                } catch {
                    body = raw;
                }
                const url = new URL(req.url, 'http://localhost');
                const record = {method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body};
                requests.push(record);
                const reply = (await handler(record)) || {status: 404, body: {message: 'not found'}};
                const payload = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {});
                res.writeHead(reply.status || 200, {'content-type': typeof reply.body === 'string' ? 'text/plain' : 'application/json', ...(reply.headers || {})});
                res.end(payload);
            });
        });
        server.listen(0, '127.0.0.1', () => {
            resolve({server, requests, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close()});
        });
    });
}

/** Silence console output for the duration of fn. */
async function quiet(fn) {
    const saved = {log: console.log, warn: console.warn, error: console.error};
    const logs = [];
    console.log = console.warn = console.error = (...args) => logs.push(args.join(' '));
    try {
        return await fn(logs);
    } finally {
        Object.assign(console, saved);
    }
}

module.exports = {fakeServer, quiet};
