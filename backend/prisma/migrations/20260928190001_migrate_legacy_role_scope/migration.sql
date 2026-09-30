-- Convert legacy global ADMIN users to the explicit multi-property business role.
-- Property-scoped ADMIN users retain their existing role and assignment.
UPDATE "User"
SET "role" = 'CORPORATE_ADMIN', "tokenVersion" = "tokenVersion" + 1
WHERE "role" = 'ADMIN' AND "staffHotelId" IS NULL;

-- The seeded reservation desk has a deterministic property mapping. Other
-- null-scope reservation accounts remain visible to the diagnostic script.
UPDATE "User" AS u
SET "staffHotelId" = h."id", "tokenVersion" = u."tokenVersion" + 1
FROM "Hotel" AS h
WHERE u."email" = 'reservation@rainwood.demo'
  AND u."role" = 'RESERVATION'
  AND u."staffHotelId" IS NULL
  AND h."code" = 'RW-KODAI';
