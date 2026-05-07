const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_change_in_prod';

router.post('/signup', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role',
      [name, email, hashed, role === 'admin' ? 'admin' : 'member']
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/me', (req, res, next) => require('../middleware/auth').authenticate(req, res, next), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id=$1', [req.user.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
