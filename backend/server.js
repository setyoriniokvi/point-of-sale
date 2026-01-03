// API Gateway ringan.
// Meneruskan request ke microservices: product, transaction, recommendation.
// CORS diizinkan untuk kebutuhan demo.

const http = require('http');
const { URL } = require('url');
const config = require('./config/config');

const PORT = process.env.PORT || config.PORTS.GATEWAY || 3000;

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function handleOptions(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end();
}

async function proxyRequest(req, targetUrl) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : null;

  const fetchOptions = {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
    body: body && body.length ? body : undefined,
  };

  const maxAttempts = 3;
  const baseDelay = 150; // ms
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.debug(`proxyRequest attempt ${attempt} -> ${targetUrl}`);
      const upstream = await fetch(targetUrl, fetchOptions);
      const data = await upstream.text();
      const contentType = upstream.headers.get('content-type') || 'application/json';

      return {
        status: upstream.status,
        headers: { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' },
        body: data,
      };
    } catch (err) {
      lastErr = err;
      console.warn(`proxyRequest error (attempt ${attempt}) -> ${err.message || err}`);
      // Retry only on connection errors
      const shouldRetry = (err && (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED'))));
      if (!shouldRetry || attempt === maxAttempts) throw err;
      await new Promise(r => setTimeout(r, baseDelay * attempt));
    }
  }

  throw lastErr;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return handleOptions(res);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      services: {
        product: config.PRODUCT_SERVICE_URL,
        transaction: config.TRANSACTION_SERVICE_URL,
        recommendation: config.RECOMMENDATION_SERVICE_URL,
      },
    });
  }

  try {
    // Support both /products and /api/products (frontend uses /api/* for API calls)
    if (path.startsWith('/products') || path.startsWith('/api/products')) {
      // strip optional /api prefix
      const trimmed = path.startsWith('/api/') ? path.replace('/api', '') : path;
      const target = `${config.PRODUCT_SERVICE_URL}${trimmed}${url.search}`;
      console.debug('Gateway proxying to', target);
      const result = await proxyRequest(req, target);
      res.writeHead(result.status, result.headers);
      return res.end(result.body);
    }

    if (path === '/calculate-total') {
      const target = `${config.TRANSACTION_SERVICE_URL}/calculate-total`;
      const result = await proxyRequest(req, target);
      res.writeHead(result.status, result.headers);
      return res.end(result.body);
    }

    if (path.startsWith('/dashboard') || path.startsWith('/api/dashboard')) {
      // forward the full path to dashboard service (dashboard service exposes /api/dashboard/*)
      const target = `${config.DASHBOARD_SERVICE_URL}${path}${url.search}`;
      console.debug('Gateway proxying to', target);
      const result = await proxyRequest(req, target);
      res.writeHead(result.status, result.headers);
      return res.end(result.body);
    }

    if (path === '/recommendation/restock') {
      const target = `${config.RECOMMENDATION_SERVICE_URL}/recommendation/restock`;
      const result = await proxyRequest(req, target);
      res.writeHead(result.status, result.headers);
      return res.end(result.body);
    }

    // Proxy auth API calls to auth-service (keeps gateway as single entrypoint)
    if (path.startsWith('/api/auth')) {
      const target = `${config.AUTH_SERVICE_URL}${path}${url.search}`;
      const result = await proxyRequest(req, target);
      res.writeHead(result.status, result.headers);
      return res.end(result.body);
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Gateway error:', err);
    sendJson(res, 502, { error: 'Bad gateway', detail: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`API gateway running on port ${PORT}`);
});

