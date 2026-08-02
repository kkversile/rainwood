# RainWood local and native deployment runbook

The two applications are intentionally independent. Run npm commands from the application they belong to. Docker, workspaces and PNPM are not required.

## Prerequisites

```powershell
node --version
npm --version
psql --version
Get-Service postgresql* | Select-Object Name,Status
```

Use Node 22 (`.nvmrc`). Node 24.18.0 was used for this validation and is compatible, but Node 22 LTS is the documented baseline. PostgreSQL 15+ is supported; PostgreSQL 17 was used locally.

On Windows, install PostgreSQL natively if absent:

```powershell
winget install PostgreSQL.PostgreSQL.17
Start-Service postgresql-x64-17
```

On Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

## Database

As a PostgreSQL administrator, review the example password and run:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -U postgres -f .\database\create_database.sql
```

If `psql` is on PATH, use `psql -U postgres -f database/create_database.sql`. The script only creates the role/database when missing. It cannot recover an unknown administrator password.

## Environment

Do not overwrite existing local files. Back them up first if needed:

```powershell
if (Test-Path backend/.env) { Copy-Item backend/.env backend/.env.backup }
if (Test-Path frontend/.env.local) { Copy-Item frontend/.env.local frontend/.env.local.backup }
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Set a real local `DATABASE_URL`, two different random JWT secrets, and the local mock/log modes. Keep `.env` and `.env.local` uncommitted. The checked-in examples contain placeholders only.

## Install and migrate

```powershell
Set-Location backend
npm.cmd install
npm.cmd run prisma:generate
$env:DATABASE_URL='postgresql://rainwood_user:change_me@localhost:5432/rainwood_db?schema=public'
npx.cmd prisma migrate deploy
npm.cmd run prisma:seed
npx.cmd prisma migrate status
```

The existing migrations are the deployment strategy. Use `prisma migrate dev` only when intentionally creating a new reviewed development migration; do not use `db push` as the final strategy.

## Start development

Terminal 1:

```powershell
Set-Location backend
npm.cmd run start:dev
```

Terminal 2:

```powershell
Set-Location frontend
npm.cmd install
npm.cmd run dev
```

Verify:

```powershell
Invoke-WebRequest http://localhost:4000/api/v1/health/ready
Start-Process http://localhost:3000
```

## Quality gates

```powershell
Set-Location backend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

```powershell
Set-Location frontend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

## Native production process

Build each application separately, apply migrations before starting the backend, and provide secrets through the process manager:

```powershell
Set-Location backend
npm.cmd run prisma:deploy
npm.cmd run build
npm.cmd run start:prod
```

```powershell
Set-Location frontend
npm.cmd run build
npm.cmd start
```

For Linux, PM2 can supervise the two commands (`pm2 start dist/src/main.js --name rainwood-api` and `pm2 start npm --name rainwood-web -- start`) or use separate systemd units. Put Nginx in front for TLS, route `/api/` to port 4000 and the web site to port 3000, set upload limits explicitly, and enable log rotation. Back up PostgreSQL with `pg_dump`/`pg_dumpall`, test restore, and never put database or payment secrets in Nginx or source files.

## Seed account

Local seed user: `admin@rainwood.demo`. Set SEED_ADMIN_PASSWORD in the ignored backend/.env before seeding, and change it before any shared environment.
