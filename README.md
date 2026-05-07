# ⚡ TaskFlow — Team Task Manager

A full-stack web application for managing projects, assigning tasks, and tracking progress with **role-based access control** (Admin / Member).

**Live Demo:** _[your-app.up.railway.app]_
**Demo credentials:**
| Role   | Email              | Password |
|--------|--------------------|----------|
| Admin  | admin@test.com     | 123456   |
| Member | member@test.com    | 123456   |

---

## 🚀 Features

| Feature | Admin | Member |
|---------|-------|--------|
| Create / delete projects | ✅ | ❌ |
| Add / remove project members | ✅ | ❌ |
| Create tasks | ✅ | ✅ (in own projects) |
| Assign tasks to users | ✅ | ❌ |
| Update task status | ✅ | ✅ (assigned tasks) |
| Edit / delete any task | ✅ | Own tasks only |
| View all projects | ✅ | Own projects only |
| Dashboard & overdue alerts | ✅ | ✅ |
| View all team members | ✅ | ❌ |

---

## 🛠 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla JS + HTML/CSS (single file, no build step) |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Deployment | Railway (app + DB on same service) |

---

## 📁 Project Structure

```
team-task-manager/
├── backend/
│   ├── server.js          # Express entry point — serves API + frontend
│   ├── db.js              # PostgreSQL pool + schema init
│   ├── middleware/
│   │   └── auth.js        # JWT authenticate + requireAdmin
│   └── routes/
│       ├── auth.js        # POST /signup, POST /login, GET /me
│       ├── projects.js    # CRUD projects + member management
│       └── tasks.js       # CRUD tasks + dashboard stats + filters
├── frontend/
│   └── index.html         # Full SPA — auth, dashboard, projects, tasks
├── seed.js                # One-time demo data seeder
├── package.json           # Root package (Railway runs this)
├── railway.json           # Railway deployment config
├── .env.example           # Environment variable template
└── README.md
```

---

## ⚙️ Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL (local or a free Railway/Neon instance)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/team-task-manager.git
cd team-task-manager

# 2. Install dependencies
npm install

# 3. Set environment variables
cp .env.example .env
# Edit .env — fill in DATABASE_URL and JWT_SECRET

# 4. Start the server (serves API + frontend together)
npm start

# 5. (Optional) Seed demo data
node seed.js

# App is live at http://localhost:5000
```

---

## 🌐 Deploy on Railway (Step-by-Step)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/team-task-manager.git
git push -u origin main
```

### 2. Create Railway project
1. Go to [railway.app](https://railway.app) → **New Project**
2. Select **Deploy from GitHub repo** → choose your repo

### 3. Add PostgreSQL
1. In your Railway project → **+ New** → **Database** → **PostgreSQL**
2. Railway automatically sets `DATABASE_URL` in your service's environment

### 4. Set environment variables
In your Railway service → **Variables** tab, add:
```
JWT_SECRET=your_super_secret_key_here_make_it_long
NODE_ENV=production
```
(`DATABASE_URL` and `PORT` are set automatically by Railway)

### 5. Deploy
Railway auto-deploys on every push. Watch the **Deployments** tab for build logs.

### 6. Seed demo data (optional)
In Railway service → **Deploy** tab → **Terminal** (or use Railway CLI):
```bash
node seed.js
```

### 7. Get your URL
Railway service → **Settings** → **Domains** → Generate domain.

---

## 🔌 REST API Reference

All authenticated routes require header: `Authorization: Bearer <token>`

### Auth
| Method | Endpoint | Body | Auth |
|--------|----------|------|------|
| POST | `/api/auth/signup` | `{ name, email, password, role? }` | No |
| POST | `/api/auth/login` | `{ email, password }` | No |
| GET | `/api/auth/me` | — | Yes |

### Projects
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/projects` | All (admin) or own (member) |
| POST | `/api/projects` | Admin only |
| GET | `/api/projects/:id` | With members list |
| PUT | `/api/projects/:id` | Admin only |
| DELETE | `/api/projects/:id` | Admin only |
| POST | `/api/projects/:id/members` | `{ user_id, role? }` — Admin only |
| DELETE | `/api/projects/:id/members/:userId` | Admin only |
| GET | `/api/projects/users/all` | All users — Admin only |

### Tasks
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/tasks` | Filters: `?status=todo&priority=high&project_id=1&overdue=true` |
| GET | `/api/tasks/dashboard` | Stats + project progress |
| GET | `/api/tasks/:id` | Single task |
| POST | `/api/tasks` | `{ title, project_id, description?, assigned_to?, priority?, due_date? }` |
| PUT | `/api/tasks/:id` | Full update |
| PATCH | `/api/tasks/:id/status` | `{ status }` — quick status change |
| DELETE | `/api/tasks/:id` | Admin or task creator |

---

## 🗄 Database Schema

```sql
users           (id, name, email, password, role, created_at)
projects        (id, name, description, owner_id → users, created_at)
project_members (project_id → projects, user_id → users, role)  PK: (project_id, user_id)
tasks           (id, title, description, project_id → projects,
                 assigned_to → users, created_by → users,
                 status, priority, due_date, created_at, updated_at)
```

---

## 📝 Submission Checklist

- [x] Authentication (Signup / Login with JWT)
- [x] Role-based access control (Admin / Member)
- [x] Project CRUD + team member management
- [x] Task CRUD + assignment + status tracking
- [x] Dashboard with stats and overdue alerts
- [x] REST API with proper validations
- [x] PostgreSQL with foreign keys and constraints
- [x] Railway deployment config
- [x] Seed script for demo data
- [x] README with setup + API docs
