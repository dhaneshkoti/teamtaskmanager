const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const hasAccess = async (projectId, userId, userRole) => {
  if (userRole === 'admin') return true;
  const r = await pool.query('SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2', [projectId, userId]);
  return r.rows.length > 0;
};

router.get('/dashboard', async (req, res) => {
  try {
    let f = '';
    const p = [];
    if (req.user.role !== 'admin') { f = 'AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id=$1)'; p.push(req.user.id); }
    const stats = await pool.query(`SELECT COUNT(*) FILTER (WHERE t.status='todo') as todo, COUNT(*) FILTER (WHERE t.status='in_progress') as in_progress, COUNT(*) FILTER (WHERE t.status='done') as done, COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status != 'done') as overdue, COUNT(*) as total FROM tasks t WHERE 1=1 ${f}`, p);
    let ps;
    if (req.user.role === 'admin') {
      ps = await pool.query(`SELECT p.id, p.name, COUNT(t.id) as total_tasks, COUNT(t.id) FILTER (WHERE t.status='done') as done_tasks FROM projects p LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id, p.name ORDER BY total_tasks DESC LIMIT 5`);
    } else {
      ps = await pool.query(`SELECT p.id, p.name, COUNT(t.id) as total_tasks, COUNT(t.id) FILTER (WHERE t.status='done') as done_tasks FROM projects p JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1 LEFT JOIN tasks t ON t.project_id = p.id GROUP BY p.id, p.name ORDER BY total_tasks DESC LIMIT 5`, [req.user.id]);
    }
    res.json({ stats: stats.rows[0], projects: ps.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/', async (req, res) => {
  const { project_id, status, assigned_to, priority, overdue } = req.query;
  try {
    let q = `SELECT t.*, u.name as assigned_name, u.email as assigned_email, c.name as creator_name, p.name as project_name FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN users c ON t.created_by = c.id LEFT JOIN projects p ON t.project_id = p.id WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (req.user.role !== 'admin') { q += ` AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id=$${idx})`; params.push(req.user.id); idx++; }
    if (project_id) { q += ` AND t.project_id=$${idx}`; params.push(project_id); idx++; }
    if (status) { q += ` AND t.status=$${idx}`; params.push(status); idx++; }
    if (assigned_to) { q += ` AND t.assigned_to=$${idx}`; params.push(assigned_to); idx++; }
    if (priority) { q += ` AND t.priority=$${idx}`; params.push(priority); idx++; }
    if (overdue === 'true') q += ` AND t.due_date < CURRENT_DATE AND t.status != 'done'`;
    q += ' ORDER BY t.created_at DESC';
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`SELECT t.*, u.name as assigned_name, c.name as creator_name, p.name as project_name FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN users c ON t.created_by = c.id LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = result.rows[0];
    if (!(await hasAccess(task.project_id, req.user.id, req.user.role))) return res.status(403).json({ error: 'Access denied' });
    res.json(task);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', async (req, res) => {
  const { title, description, project_id, assigned_to, status, priority, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (!project_id) return res.status(400).json({ error: 'project_id is required' });
  try {
    if (!(await hasAccess(project_id, req.user.id, req.user.role))) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(`INSERT INTO tasks (title, description, project_id, assigned_to, created_by, status, priority, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [title, description, project_id, assigned_to || null, req.user.id, status || 'todo', priority || 'medium', due_date || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', async (req, res) => {
  const { title, description, assigned_to, status, priority, due_date } = req.body;
  try {
    const tr = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (tr.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = tr.rows[0];
    if (!(await hasAccess(task.project_id, req.user.id, req.user.role))) return res.status(403).json({ error: 'Access denied' });
    if (req.user.role === 'member' && task.assigned_to !== req.user.id && task.created_by !== req.user.id) return res.status(403).json({ error: 'You can only edit your own tasks' });
    const result = await pool.query(`UPDATE tasks SET title=COALESCE($1,title), description=COALESCE($2,description), assigned_to=$3, status=COALESCE($4,status), priority=COALESCE($5,priority), due_date=$6, updated_at=NOW() WHERE id=$7 RETURNING *`, [title, description, assigned_to !== undefined ? assigned_to : task.assigned_to, status, priority, due_date !== undefined ? due_date : task.due_date, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['todo', 'in_progress', 'done'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const tr = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (tr.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    if (!(await hasAccess(tr.rows[0].project_id, req.user.id, req.user.role))) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query('UPDATE tasks SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [status, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const tr = await pool.query('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
    if (tr.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    if (req.user.role !== 'admin' && tr.rows[0].created_by !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ message: 'Task deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
