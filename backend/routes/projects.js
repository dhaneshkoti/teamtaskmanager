const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/projects - list projects for current user
router.get('/', async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      // Admins see all projects
      result = await pool.query(`
        SELECT p.*, u.name as owner_name,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
          (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
        FROM projects p
        LEFT JOIN users u ON p.owner_id = u.id
        ORDER BY p.created_at DESC
      `);
    } else {
      // Members see only their projects
      result = await pool.query(`
        SELECT p.*, u.name as owner_name,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
          (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) as member_count
        FROM projects p
        LEFT JOIN users u ON p.owner_id = u.id
        JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
        ORDER BY p.created_at DESC
      `, [req.user.id]);
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects - create project (admin only)
router.post('/', async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Only admins can create projects' });

  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });

  try {
    const result = await pool.query(
      'INSERT INTO projects (name, description, owner_id) VALUES ($1,$2,$3) RETURNING *',
      [name, description, req.user.id]
    );
    const project = result.rows[0];
    // Add creator as admin member
    await pool.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3)',
      [project.id, req.user.id, 'admin']
    );
    res.status(201).json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/projects/:id - get single project
router.get('/:id', async (req, res) => {
  try {
    const projectResult = await pool.query(`
      SELECT p.*, u.name as owner_name FROM projects p
      LEFT JOIN users u ON p.owner_id = u.id
      WHERE p.id = $1
    `, [req.params.id]);

    if (projectResult.rows.length === 0)
      return res.status(404).json({ error: 'Project not found' });

    // Check access
    if (req.user.role !== 'admin') {
      const access = await pool.query(
        'SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2',
        [req.params.id, req.user.id]
      );
      if (access.rows.length === 0)
        return res.status(403).json({ error: 'Access denied' });
    }

    const membersResult = await pool.query(`
      SELECT u.id, u.name, u.email, pm.role FROM users u
      JOIN project_members pm ON pm.user_id = u.id
      WHERE pm.project_id = $1
    `, [req.params.id]);

    res.json({ ...projectResult.rows[0], members: membersResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/projects/:id - update project (admin only)
router.put('/:id', async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Only admins can update projects' });

  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });

  try {
    const result = await pool.query(
      'UPDATE projects SET name=$1, description=$2 WHERE id=$3 RETURNING *',
      [name, description, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/projects/:id (admin only)
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Only admins can delete projects' });

  try {
    const result = await pool.query('DELETE FROM projects WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects/:id/members - add member (admin only)
router.post('/:id/members', async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Only admins can add members' });

  const { user_id, role } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    await pool.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (project_id, user_id) DO UPDATE SET role=$3',
      [req.params.id, user_id, role || 'member']
    );
    res.json({ message: 'Member added' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/projects/:id/members/:userId (admin only)
router.delete('/:id/members/:userId', async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Only admins can remove members' });

  try {
    await pool.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [req.params.id, req.params.userId]);
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/projects/users/all - get all users (for assigning, admin only)
router.get('/users/all', async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  try {
    const result = await pool.query('SELECT id, name, email, role FROM users ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
