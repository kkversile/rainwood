import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("operations logbook exposes the accountable handover workflow", () => {
  const component = read("src/components/OperationsLogbookData.tsx");
  const service = read(
    "../backend/src/modules/operations-logbook/operations-logbook.service.ts",
  );
  const page = read("src/app/admin/logbook/page.tsx");
  const frontDesk = read("src/components/FrontDeskWorkspace.tsx");
  const maintenance = read("src/components/MaintenanceBoard.tsx");
  const housekeeping = read("src/components/HousekeepingBoard.tsx");
  const guestProfile = read("src/app/admin/guests/[id]/page.tsx");
  for (const token of [
    "Operations Logbook",
    "Handover view",
    "Print handover",
    "Print includes this page only",
    "History uses 25 items per page",
    "Add update",
    "Acknowledge",
    "Resolve",
    "Carried forward",
    "Current Business Day",
    "Business Date",
    "Due within 2h",
    "operationsLogbookPrivacy",
    "getOperationsLogbookCapabilities",
    "requiresHotelSelection",
    "ACCOUNTS",
    "VIEWER",
    "/operations-logbook/options",
    "reservationRef",
    "reservationId",
    "maintenanceTicketId",
    "housekeepingTaskId",
  ])
    assert.match(
      component,
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  assert.match(component, /Current Shift Handover uses 100 items\s+per page/);
  for (const token of [
    "OPERATIONS_LOG_CREATED",
    "OPERATIONS_LOG_ACKNOWLEDGED",
    "OPERATIONS_LOG_RESOLVED",
    "businessDate",
    "SERVICE_STAFF",
    "OperationsLogbookController",
  ])
    assert.match(
      service +
        read(
          "../backend/src/modules/operations-logbook/operations-logbook.controller.ts",
        ),
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  assert.match(page, /OperationsLogbookData/);
  assert.match(frontDesk, /reservationRef/);
  assert.match(maintenance, /maintenanceTicketId/);
  assert.match(housekeeping, /housekeepingTaskId/);
  assert.match(guestProfile, /guestProfileId/);
});
