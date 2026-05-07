const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Helper: check if user has access to a project
const hasProjectAccess = async (projectId, userId, userRole) => {
  if (userRole === 'admin') return true;
  const res = await pool.query('SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2', [projectId, userId]);
  return res.rows.length > 0;
};

// GET /api/tasks - get tasks (filtered by project, assigned_to, status, etc.)
router.get('/', async (req, res) => {
  const { project_id, status, assigned_to, priority, overdue } = req.query;
  try {
    let query = `
      SELECT t.*, 
        u.name as assigned_name, u.email as assigned_email,
        c.name as creator_name,
        p.name as project_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users c ON t.created_by = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    // Access control
    if (req.user.role !== 'admin') {
      query += ` AND t.project_id IN (
        SELECT project_id FROM project_members WHERE user_id=$${idx}
      )`;
      params.push(req.user.id);
      idx++;
    }

    if (project_id) {
      query += ` AND t.project_id=$${idx}`;
      params.push(project_id);
      idx++;
    }
    if (status) {
      query += ` AND t.status=$${idx}`;
      params.push(status);
      idx++;
    }
    if (assigned_to) {
      query += ` AND t.assigned_to=$${idx}`;
      params.push(assigned_to);
      idx++;
    }
    if (priority) {
      query += ` AND t.priority=$${idx}`;
      params.push(priority);
      idx++;
    }
    if (overdue === 'true') {
      query += ` AND t.due_date < CURRENT_DATE AND t.status != 'done'`;
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tasks/dashboard - summary stats
router.get('/dashboard', async (req, res) => {
  try {
    let projectFilter = '';
    const params = [];

    if (req.user.role !== 'admin') {
      projectFilter = `AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id=$1)`;
      params.push(req.user.id);
    }

    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE t.status='todo') as todo,
        COUNT(*) FILTER (WHERE t.status='in_progress') as in_progress,
        COUNT(*) FILTER (WHERE t.status='done') as done,
        COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status != 'done') as overdue,
        COUNT(*) as total
      FROM tasks t
      WHERE 1=1 ${projectFilter}
    `, params);

    let projectStats;
    if (req.user.role === 'admin') {
      projectStats = await pool.query(`
        SELECT p.id, p.name,
          COUNT(t.id) as total_tasks,
          COUNT(t.id) FILTER (WHERE t.status='done') as done_tasks
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id
        GROUP BY p.id, p.name
        ORDER BY total_tasks DESC LIMIT 5
      `);
    } else {
      projectStats = await pool.query(`
        SELECT p.id, p.name,
          COUNT(t.id) as total_tasks,
          COUNT(t.id) FILTER (WHERE t.status='done') as done_tasks
        FROM projects p
        JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
        LEFT JOIN tasks t ON t.project_id = p.id
        GROUP BY p.id, p.name
        ORDER BY total_tasks DESC LIMIT 5
      `, [req.user.id]);
    }

    res.json({ stats: stats.rows[0], projects: projectStats.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, u.name as assigned_name, c.name as creator_name, p.name as project_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users c ON t.created_by = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const task = result.rows[0];
    const access = await hasProjectAccess(task.project_id, req.user.id, req.user.role);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks - create task
router.post('/', async (req, res) => {
  const { title, description, project_id, assigned_to, status, priority, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (!project_id) return res.status(400).json({ error: 'project_id is required' });

  try {
    const access = await hasProjectAccess(project_id, req.user.id, req.user.role);
    if (!access) return res.status(403).json({ error: 'Access denied to this project' });

    const result = await pool.query(
      `INSERT INTO tasks (title, description, project_id, assigned_to, created_by, status, priority, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, description, project_id, assigned_to || null, req.user.id, status || 'todo', priority || 'medium', due_date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/tasks/:id - update task
router.put('/:id', async (req, res) => {
  const { title, description, assigned_to, status, priority, due_date } = req.body;

  try {
    const taskResult = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const task = taskResult.rows[0];
    const access = await hasProjectAccess(task.project_id, req.user.id, req.user.role);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    // Members can only update status (not reassign or rename unless it's their task)
    if (req.user.role === 'member' && task.assigned_to !== req.user.id && task.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit tasks assigned to you or created by you' });
    }

    const result = await pool.query(
      `UPDATE tasks SET 
        title=COALESCE($1, title),
        description=COALESCE($2, description),
        assigned_to=$3,
        status=COALESCE($4, status),
        priority=COALESCE($5, priority),
        due_date=$6,
        updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [title, description, assigned_to !== undefined ? assigned_to : task.assigned_to, status, priority, due_date !== undefined ? due_date : task.due_date, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/tasks/:id/status - quick status update
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['todo', 'in_progress', 'done'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: 'Invalid status. Use: todo, in_progress, done' });

  try {
    const taskResult = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const task = taskResult.rows[0];
    const access = await hasProjectAccess(task.project_id, req.user.id, req.user.role);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const result = await pool.query(
      'UPDATE tasks SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/tasks/:id (admin or creator)
router.delete('/:id', async (req, res) => {
  try {
    const taskResult = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const task = taskResult.rows[0];
    if (req.user.role !== 'admin' && task.created_by !== req.user.id)
      return res.status(403).json({ error: 'Only admins or task creators can delete tasks' });

    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
