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

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
