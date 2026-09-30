-- Add the multi-property business administrator role without changing existing credentials.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CORPORATE_ADMIN';
