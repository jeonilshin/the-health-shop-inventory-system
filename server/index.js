require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// Health check endpoint for Render
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/export', require('./routes/export'));
app.use('/api/search', require('./routes/search'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/system-check', require('./routes/system-check'));
app.use('/api/messages', require('./routes/messages'));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
