require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// ── Security Headers ─────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile, curl, same-origin)
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body Parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ── Simple Rate Limiter (in-memory) ──────────────────────────
const rateLimitStore = new Map();

function rateLimit({ windowMs = 60000, max = 100, keyFn = (req) => req.ip } = {}) {
  // Prune expired entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
      if (now - data.resetAt > windowMs) rateLimitStore.delete(key);
    }
  }, 5 * 60 * 1000).unref();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now - entry.resetAt > windowMs) {
      rateLimitStore.set(key, { count: 1, resetAt: now });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((windowMs - (now - entry.resetAt)) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter,
      });
    }
    next();
  };
}

// Strict rate limit for auth endpoints: 20 attempts per 15 minutes per IP
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// Standard limiter for all other API routes: 300/min
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300 });

// ── Request Logger ────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const color = res.statusCode >= 500 ? '\x1b[31m'
                  : res.statusCode >= 400 ? '\x1b[33m'
                  : res.statusCode >= 300 ? '\x1b[36m'
                  : '\x1b[32m';
      console.log(`${color}${req.method}\x1b[0m ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    });
    next();
  });
}

// ── Health Check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',               authLimiter, require('./routes/auth'));
app.use('/api/locations',          apiLimiter, require('./routes/locations'));
app.use('/api/inventory',          apiLimiter, require('./routes/inventory'));
app.use('/api/transfers',          apiLimiter, require('./routes/transfers'));
app.use('/api/sales',              apiLimiter, require('./routes/sales'));
app.use('/api/reports',            apiLimiter, require('./routes/reports'));
app.use('/api/users',              apiLimiter, require('./routes/users'));
app.use('/api/deliveries',         apiLimiter, require('./routes/deliveries'));
app.use('/api/export',             apiLimiter, require('./routes/export'));
app.use('/api/search',             apiLimiter, require('./routes/search'));
app.use('/api/audit',              apiLimiter, require('./routes/audit'));
app.use('/api/notifications',      apiLimiter, require('./routes/notifications'));
app.use('/api/system-check',       apiLimiter, require('./routes/system-check'));
app.use('/api/messages',           apiLimiter, require('./routes/messages'));
app.use('/api/unit-conversions',   apiLimiter, require('./routes/unit-conversions'));
app.use('/api/sales-reports',      apiLimiter, require('./routes/sales-reports'));
app.use('/api/sales-transactions', apiLimiter, require('./routes/sales-transactions'));
app.use('/api/import',             apiLimiter, require('./routes/import'));

// ── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global Error Handler ──────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Don't expose internal details in production
  const isDev = process.env.NODE_ENV !== 'production';
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error('[ERROR]', req.method, req.originalUrl, err.message);
    if (isDev) console.error(err.stack);
  }

  res.status(status).json({
    error: isDev ? err.message : 'An unexpected error occurred. Please try again.',
    ...(isDev && { stack: err.stack }),
  });
});

// ── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`\x1b[32m✓\x1b[0m Server running on port \x1b[1m${PORT}\x1b[0m [${process.env.NODE_ENV || 'development'}]`);
});

// ── Graceful Shutdown ─────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`\n[${signal}] Gracefully shutting down...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  // Force exit after 10s if connections don't close
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err);
  process.exit(1);
});
