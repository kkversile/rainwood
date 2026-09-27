-- Keep the oldest active task for each room and cancel later duplicates so the
-- uniqueness guarantee can be introduced without deleting task history.
WITH ranked AS (
  SELECT
    "id",
    "hotelId",
    "roomId",
    "status",
    ROW_NUMBER() OVER (PARTITION BY "roomId" ORDER BY "createdAt" ASC, "id" ASC) AS row_number
  FROM "HousekeepingTask"
  WHERE "status" IN (
    'PENDING'::"HousekeepingTaskStatus",
    'ACCEPTED'::"HousekeepingTaskStatus",
    'CLEANING'::"HousekeepingTaskStatus"
  )
), duplicates AS (
  SELECT "id", "hotelId", "roomId", "status"
  FROM ranked
  WHERE row_number > 1
), updated AS (
  UPDATE "HousekeepingTask" task
  SET
    "status" = 'CANCELLED'::"HousekeepingTaskStatus",
    "note" = CASE
      WHEN task."note" IS NULL OR task."note" = '' THEN 'Cancelled during active task deduplication migration.'
      ELSE task."note" || ' | Cancelled during active task deduplication migration.'
    END,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM duplicates duplicate
  WHERE task."id" = duplicate."id"
  RETURNING task."id", task."hotelId", task."roomId", duplicate."status" AS prior_status
)
INSERT INTO "AuditLog" ("id", "actorUserId", "action", "entityType", "entityId", "before", "after")
SELECT
  md5('housekeeping-dedupe:' || "id"),
  NULL,
  'HOUSEKEEPING_TASK_CANCELLED',
  'HousekeepingTask',
  "id",
  jsonb_build_object('taskId', "id", 'hotelId', "hotelId", 'roomId', "roomId", 'status', prior_status),
  jsonb_build_object('taskId', "id", 'hotelId', "hotelId", 'roomId', "roomId", 'status', 'CANCELLED', 'reason', 'Active task deduplication migration')
FROM updated;

CREATE UNIQUE INDEX "HousekeepingTask_one_active_per_room"
ON "HousekeepingTask" ("roomId")
WHERE "status" IN (
  'PENDING'::"HousekeepingTaskStatus",
  'ACCEPTED'::"HousekeepingTaskStatus",
  'CLEANING'::"HousekeepingTaskStatus"
);
