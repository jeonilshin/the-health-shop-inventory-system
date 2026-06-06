require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const pool = require('./config/db');

const app = express();

const isProd = process.env.NODE_ENV === 'production';

// In production the client is served from the same origin — no CORS needed.
// In development allow localhost:3001.
if (!isProd) {
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    credentials: true,
  }));
} else {
  // Allow Railway URL and any explicit override
  const rawOrigins = process.env.CORS_ORIGIN || '';
  const allowed = rawOrigins.split(',').map(u => u.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  }));
}

app.use(express.json({ limit: '10mb' }));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false, validate: { xForwardedForHeader: false } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, validate: { xForwardedForHeader: false } });

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/products', require('./routes/products'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/history', require('./routes/history'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/stock-withdrawals', require('./routes/stock-withdrawals'));
app.use('/api/unit-conversions', require('./routes/unit-conversions'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/delivery-discrepancies', require('./routes/delivery-discrepancies'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/sales-reports', require('./routes/sales-reports'));
app.use('/api/import', require('./routes/import'));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

// Serve React build in production
if (isProd) {
  const clientBuild = path.join(__dirname, '../client/build');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await pool.query('SELECT 1');
    console.log('Database connected successfully');
  } catch (err) {
    console.error('Database connection failed:', err.message);
  }
});
