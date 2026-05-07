/**
 * seed.js — Run once after first deploy to create demo accounts
 * Usage:  node seed.js
 * Requires DATABASE_URL and optionally JWT_SECRET in environment.
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Seeding demo accounts…');

    const users = [
      { name: 'Admin User',   email: 'admin@test.com',  password: '123456', role: 'admin'  },
      { name: 'Alice Member', email: 'member@test.com', password: '123456', role: 'member' },
      { name: 'Bob Dev',      email: 'bob@test.com',    password: '123456', role: 'member' },
    ];

    for (const u of users) {
      const exists = await client.query('SELECT id FROM users WHERE email=$1', [u.email]);
      if (exists.rows.length) { console.log(`  ⏭  ${u.email} already exists — skipped`); continue; }
      const hash = await bcrypt.hash(u.password, 10);
      await client.query(
        'INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4)',
        [u.name, u.email, hash, u.role]
      );
      console.log(`  ✅  Created ${u.role}: ${u.email} / ${u.password}`);
    }

    // Demo project
    const proj = await client.query('SELECT id FROM projects LIMIT 1');
    if (!proj.rows.length) {
      const adminRow = await client.query("SELECT id FROM users WHERE email='admin@test.com'");
      const adminId = adminRow.rows[0].id;

      const projRow = await client.query(
        "INSERT INTO projects (name, description, owner_id) VALUES ($1,$2,$3) RETURNING id",
        ['Website Redesign', 'Revamp the company marketing site', adminId]
      );
      const projectId = projRow.rows[0].id;
      await client.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,'admin')", [projectId, adminId]);

      const memberRow = await client.query("SELECT id FROM users WHERE email='member@test.com'");
      const memberId = memberRow.rows[0].id;
      await client.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,'member')", [projectId, memberId]);

      // Sample tasks
      const tasks = [
        { title: 'Design new homepage mockup',  status: 'done',        priority: 'high',   assigned: memberId,  due: '2025-01-10' },
        { title: 'Build responsive nav',         status: 'in_progress', priority: 'high',   assigned: memberId,  due: '2025-02-01' },
        { title: 'Write SEO copy',               status: 'todo',        priority: 'medium', assigned: null,      due: '2025-03-15' },
        { title: 'Set up Google Analytics',      status: 'todo',        priority: 'low',    assigned: null,      due: null },
      ];
      for (const t of tasks) {
        await client.query(
          'INSERT INTO tasks (title, project_id, assigned_to, created_by, status, priority, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [t.title, projectId, t.assigned, adminId, t.status, t.priority, t.due]
        );
      }
      console.log(`  ✅  Created demo project "Website Redesign" with ${tasks.length} tasks`);
    }

    console.log('\n✨ Seed complete!');
    console.log('   Admin  → admin@test.com  / 123456');
    console.log('   Member → member@test.com / 123456');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
