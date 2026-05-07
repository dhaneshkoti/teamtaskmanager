require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    env: process.env.NODE_ENV
  });
});

// ── Serve frontend ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'TaskFlow Backend API Running'
  });
});

// ── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(500).json({
    error: 'Internal server error'
  });
});

// ── Boot ────────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await initDB();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Frontend → http://localhost:${PORT}`);
      console.log(`🔌 API → http://localhost:${PORT}/api`);
    });

  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
};

start();