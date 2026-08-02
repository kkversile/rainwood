# PostgreSQL setup

1. Install PostgreSQL 15 or newer directly on the machine.
2. Run `create_database.sql` as the postgres superuser.
3. Copy `backend/.env.example` to `backend/.env` and update `DATABASE_URL`.
4. From backend, run npm install, npm run prisma:generate, npx prisma migrate deploy, and npm run prisma:seed.
5. The reviewed post-deploy checks are represented by the second Prisma migration; do not use prisma db push as the deployment strategy.
