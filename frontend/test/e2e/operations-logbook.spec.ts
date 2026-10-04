import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? "";
}

async function login(
  page: import("@playwright/test").Page,
  base: string,
  next = "/rainwood/admin/logbook",
  email = localEnv("NEXT_PUBLIC_DEMO_ADMIN_EMAIL"),
) {
  await page.goto(`${base}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page
    .getByLabel("Password")
    .fill(localEnv("NEXT_PUBLIC_DEMO_ADMIN_PASSWORD"));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/admin/logbook(?:\\?.*)?$`,
    ),
  );
}

test("admin can complete a synthetic operations logbook handover lifecycle", async ({
  page,
}) => {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3001/rainwood";
  await login(page, base);
  await expect(
    page.getByRole("heading", { name: "Operations Logbook", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".operationsLogbookSummary")
      .getByText("Open", { exact: true }),
  ).toBeVisible();
  const title = `Synthetic browser handover ${Date.now()}`;
  await page.getByRole("button", { name: "+ New entry" }).click();
  const formDialog = page.getByRole("dialog", {
    name: "Add to Operations Logbook",
  });
  await formDialog.getByLabel("Title").fill(title);
  await formDialog
    .getByLabel("Details")
    .fill("Synthetic browser verification for the next shift.");
  await formDialog.getByLabel("Category").selectOption("GENERAL");
  await formDialog.getByLabel("Priority").selectOption("IMPORTANT");
  await formDialog.getByRole("button", { name: "Save entry" }).click();
  const card = page.getByRole("button", { name: new RegExp(title) });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(
    page.getByText("Acknowledged", { exact: true }).last(),
  ).toBeVisible();
  await page
    .getByPlaceholder("Record the next action or handover detail")
    .fill("Synthetic update recorded in browser.");
  await page.getByRole("button", { name: "Add update" }).click();
  await expect(
    page.getByText("Synthetic update recorded in browser.", { exact: true }),
  ).toBeVisible();
  await page
    .getByPlaceholder("What was completed?")
    .fill("Synthetic browser lifecycle completed.");
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(
    page.getByText("Resolved", { exact: true }).last(),
  ).toBeVisible();
});

test("front desk reservation reference preselects a database-linked reservation", async ({
  page,
}) => {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3001/rainwood";
  await login(
    page,
    base,
    "/rainwood/admin/logbook?reservationRef=RW-ARRIVAL-001&category=ARRIVAL",
  );
  const formDialog = page.getByRole("dialog", {
    name: "Add to Operations Logbook",
  });
  const reservationSelect = formDialog
    .locator("label")
    .filter({ hasText: /^Reservation/ })
    .locator("select");
  await expect(reservationSelect).toHaveValue(/.+/);
  await expect
    .poll(async () =>
      reservationSelect.evaluate(
        (element) =>
          (element as HTMLSelectElement).selectedOptions[0]?.textContent ?? "",
      ),
    )
    .toContain("RW-ARRIVAL-001");
  await formDialog
    .getByLabel("Title")
    .fill(`Synthetic reservation context ${Date.now()}`);
  await formDialog
    .getByLabel("Details")
    .fill("Reservation context prefill verification.");
  await formDialog.getByRole("button", { name: "Save entry" }).click();
  await expect(
    page.getByText("Synthetic reservation context", { exact: false }).first(),
  ).toBeVisible();
});

test("selecting a historical business date switches away from current handover", async ({
  page,
}) => {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3001/rainwood";
  await login(page, base);
  await page
    .getByRole("button", { name: "Handover view", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Current Shift Handover", exact: true }),
  ).toBeVisible();
  const businessDate = page.getByRole("textbox", {
    name: "Business Date",
    exact: true,
  });
  await expect(businessDate).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  const current = await businessDate.inputValue();
  const historicalDate = new Date(`${current}T00:00:00.000Z`);
  historicalDate.setUTCDate(historicalDate.getUTCDate() - 1);
  const historical = historicalDate.toISOString().slice(0, 10);
  await businessDate.fill(historical);
  await expect(
    page.getByRole("heading", { name: "Logbook History", exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/view=handover/);
  await expect(page).toHaveURL(new RegExp(`businessDate=${historical}`));
});

test("accounts can select a hotel and create only payment follow-ups", async ({
  page,
}) => {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3001/rainwood";
  await login(page, base, "/rainwood/admin/logbook", "accounts@rainwood.demo");
  await expect(
    page.getByRole("heading", { name: "Operations Logbook", exact: true }),
  ).toBeVisible();
  const hotel = page.getByLabel("Hotel");
  await expect(hotel).toBeVisible();
  await expect(hotel.locator("option")).not.toHaveCount(1);
  await hotel.selectOption(
    (await hotel.locator("option").nth(1).getAttribute("value"))!,
  );
  await expect(page.getByRole("button", { name: "+ New entry" })).toBeVisible();
  await page.getByRole("button", { name: "+ New entry" }).click();
  const formDialog = page.getByRole("dialog", {
    name: "Add to Operations Logbook",
  });
  const category = formDialog.getByLabel("Category");
  await expect(category.locator("option")).toHaveCount(1);
  await expect(category).toHaveValue("PAYMENT_FOLLOWUP");
  const title = `Synthetic payment follow-up ${Date.now()}`;
  await formDialog.getByLabel("Title").fill(title);
  await formDialog
    .getByLabel("Details")
    .fill("Synthetic accounts follow-up for browser role verification.");
  await formDialog.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});

test("viewer can select a hotel and read the logbook without create options or mutations", async ({
  page,
}) => {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3001/rainwood";
  const optionRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/operations-logbook/options"))
      optionRequests.push(request.url());
  });
  await login(page, base, "/rainwood/admin/logbook", "viewer@rainwood.demo");
  await expect(
    page.getByRole("heading", { name: "Operations Logbook", exact: true }),
  ).toBeVisible();
  const hotel = page.getByLabel("Hotel");
  await expect(hotel).toBeVisible();
  await hotel.selectOption(
    (await hotel.locator("option").nth(1).getAttribute("value"))!,
  );
  await expect(page.getByRole("button", { name: "+ New entry" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Acknowledge", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Resolve", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add update", exact: true }),
  ).toHaveCount(0);
  await expect.poll(() => optionRequests.length).toBe(0);
  const visibleEntry = page
    .getByRole("button", { name: /Synthetic payment follow-up/ })
    .first();
  await expect(visibleEntry).toBeVisible();
  await visibleEntry.click();
  await expect(
    page.getByRole("dialog", { name: /Synthetic payment follow-up/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true }),
  ).toBeVisible();
});
