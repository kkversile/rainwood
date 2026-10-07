import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const frontendUrl = "http://localhost:3001/rainwood";
const fixturePrefix = `RW-BANQUET-BROWSER-${Date.now()}`;
const fixtureScript = resolve(
  process.cwd(),
  "..",
  "backend",
  "test",
  "groups-browser-fixture.ts",
);
const tsxCli = resolve(
  process.cwd(),
  "..",
  "backend",
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs",
);
const fixture = JSON.parse(
  execFileSync(
    process.execPath,
    [tsxCli, fixtureScript, "seed", fixturePrefix],
    {
      cwd: resolve(process.cwd(), "..", "backend"),
      env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL },
      encoding: "utf8",
    },
  ),
);

test.afterAll(() => {
  execFileSync(
    process.execPath,
    [tsxCli, fixtureScript, "cleanup", fixturePrefix],
    {
      cwd: resolve(process.cwd(), "..", "backend"),
      env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL },
      stdio: "ignore",
    },
  );
});

function localEnv(name: string) {
  const line = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1) ?? "";
}
async function login(
  page: any,
  email: string,
  next = "/rainwood/admin/banquets",
) {
  await page.goto(`${frontendUrl}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page
    .getByLabel("Password")
    .fill(localEnv("NEXT_PUBLIC_DEMO_ADMIN_PASSWORD"));
  await page.getByRole("button", { name: "Sign in" }).click();
}
function futureDate(days: number) {
  const value = new Date(Date.now() + days * 86_400_000);
  return value.toISOString().slice(0, 10);
}

test("Reservation user completes event edit, function, BEO save-and-finalize, calendar, and Logbook flow", async ({
  page,
}) => {
  await login(page, "reservation@rainwood.demo");
  await expect(page).toHaveURL(`${frontendUrl}/admin/banquets`);
  await expect(
    page.getByRole("heading", { name: "Banquets & Events" }),
  ).toBeVisible();
  const eventName = `Synthetic Catering Event ${Date.now()}`;
  const eventDate = futureDate(14 + (Date.now() % 300));
  const eventForm = page
    .locator("form")
    .filter({ hasText: "Create event" })
    .first();
  await eventForm
    .getByLabel("Hotel")
    .selectOption({ label: "RainWood Aurum Kodaikanal" });
  await eventForm.getByLabel("Event name").fill(eventName);
  await eventForm.getByLabel("Start date").fill(eventDate);
  await eventForm.getByLabel("End date").fill(eventDate);
  await eventForm.getByLabel("Primary contact").fill("Synthetic Event Contact");
  await eventForm.getByLabel("Contact mobile").fill("9000012345");
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/v1/banquets"),
  );
  await eventForm.getByRole("button", { name: "Create event" }).click();
  const createdEvent = await (await createResponsePromise).json();
  await expect(page.getByRole('status')).toContainText('Created');

  const overviewForm = page
    .locator("form")
    .filter({ hasText: "Save event details" })
    .first();
  await overviewForm.getByLabel("Event name").fill(`${eventName} Updated`);
  await overviewForm
    .getByLabel("Primary contact")
    .fill("Updated Event Contact");
  const eventPatchPromise = page.waitForRequest(
    (request) =>
      request.method() === "PATCH" &&
      request.url().includes(`/api/v1/banquets/${createdEvent.id}`) &&
      !request.url().includes("/functions"),
  );
  await overviewForm
    .getByRole("button", { name: "Save event details" })
    .click();
  const eventPatch = await eventPatchPromise;
  expect(JSON.parse(eventPatch.postData() ?? "{}")).not.toHaveProperty(
    "hotelId",
  );
  await expect(page.getByText("Event details updated.")).toBeVisible();
  await page.goto(
    `${frontendUrl}/admin/banquets?event=${encodeURIComponent(createdEvent.id)}`,
  );
  await expect(
    page
      .locator("form")
      .filter({ hasText: "Save event details" })
      .getByLabel("Event name"),
  ).toHaveValue(`${eventName} Updated`);
  await page.getByRole("tab", { name: "Functions" }).click();

  const functionForm = page
    .locator("form")
    .filter({ hasText: "Add function" })
    .first();
  await functionForm
    .getByLabel("Function space")
    .selectOption({ label: "Grand Ballroom (BALLROOM)" });
  await functionForm.getByLabel("Function name").fill("Synthetic Main Session");
  await functionForm.getByLabel("Date", { exact: true }).fill(eventDate);
  await functionForm.getByLabel("Start").fill("18:00");
  await functionForm.getByLabel("End").fill("19:00");
  await functionForm.getByLabel("Expected PAX").fill("40");
  await functionForm.getByLabel("Guaranteed PAX").fill("30");
  await functionForm.getByRole("button", { name: "Add function" }).click();
  await expect(
    page.getByText("Function added and venue availability confirmed."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create BEO" }).click();
  await expect(page.getByText("BEO is ready for editing.")).toBeVisible();
  await page.getByRole("tab", { name: "BEO" }).click();
  await expect(page.getByText(/BEO-/).first()).toBeVisible();
  await page.getByRole("button", { name: "+ Charge" }).click();
  const defaultCharge = page.locator(".beoChargeRow").last();
  await expect(defaultCharge.locator("select")).toHaveValue("MISCELLANEOUS");
  await defaultCharge
    .getByPlaceholder("Charge description")
    .fill("Additional setup");
  await defaultCharge.getByLabel("Charge quantity 2").fill("1");
  await defaultCharge.getByLabel("Charge unit amount 2").fill("500");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("BEO draft saved.")).toBeVisible();
  await page.goto(
    `${frontendUrl}/admin/banquets?event=${encodeURIComponent(createdEvent.id)}`,
  );
  await page.getByRole("tab", { name: "BEO" }).click();
  const persistedDefaultCharge = page.locator(".beoChargeRow").last();
  await expect(persistedDefaultCharge.locator("select")).toHaveValue(
    "MISCELLANEOUS",
  );
  await expect(
    persistedDefaultCharge.getByPlaceholder("Charge description"),
  ).toHaveValue("Additional setup");
  await expect(
    persistedDefaultCharge.getByLabel("Charge unit amount 2"),
  ).toHaveValue("500");
  await page
    .getByLabel("Operational notes")
    .fill("Finalized synthetic operations note");
  await page.getByLabel("Schedule item 1").fill("Finalized synthetic setup");
  const chargeCategories = [
    "VENUE_RENTAL",
    "AUDIO_VISUAL",
    "FOOD_PACKAGE",
    "DECORATION",
    "EQUIPMENT",
    "MISCELLANEOUS",
  ];
  for (let index = 2; index < chargeCategories.length; index += 1)
    await page.getByRole("button", { name: "+ Charge" }).click();
  const chargeRows = page.locator(".beoChargeRow");
  await expect(chargeRows).toHaveCount(chargeCategories.length);
  for (let index = 0; index < chargeCategories.length; index += 1) {
    const row = chargeRows.nth(index);
    await row.locator("select").selectOption(chargeCategories[index]);
    await row
      .getByPlaceholder("Charge description")
      .fill(`Synthetic ${chargeCategories[index]}`);
    await row.getByLabel(`Charge quantity ${index + 1}`).fill("1");
    await row
      .getByLabel(`Charge unit amount ${index + 1}`)
      .fill(String(1000 + index));
  }
  await page.getByRole("button", { name: "Finalize BEO" }).click();
  await expect(page.getByText("BEO finalized.")).toBeVisible();
  await page.goto(
    `${frontendUrl}/admin/banquets?event=${encodeURIComponent(createdEvent.id)}`,
  );
  await page.getByRole("tab", { name: "BEO" }).click();
  await expect(page.getByText("FINAL", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Operational notes")).toHaveValue(
    "Finalized synthetic operations note",
  );
  await expect(page.getByLabel("Schedule item 1")).toHaveValue(
    "Finalized synthetic setup",
  );
  await expect(page.locator(".beoChargeRow")).toHaveCount(
    chargeCategories.length,
  );

  await page.getByRole("link", { name: "Add to Operations Logbook" }).click();
  await expect(
    page.getByRole("dialog", { name: "Add to Operations Logbook" }),
  ).toBeVisible();
  const logbookDialog = page.getByRole("dialog", {
    name: "Add to Operations Logbook",
  });
  await expect(logbookDialog.getByLabel("Category")).toHaveValue("GENERAL");
  await expect(logbookDialog.getByLabel("Title")).toHaveValue(
    new RegExp(`Banquet follow-up — ${createdEvent.eventCode}`),
  );
  await expect(logbookDialog.getByLabel("Details")).toContainText(
    "Synthetic Catering Event",
  );
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(
    page.getByRole("dialog", { name: "Add to Operations Logbook" }),
  ).toHaveCount(0);

  await page.goto(
    `${frontendUrl}/admin/banquets?event=${encodeURIComponent(createdEvent.id)}`,
  );
  await page.getByRole("link", { name: "Function calendar" }).click();
  await page.getByLabel("From").fill(eventDate);
  await expect(
    page.getByRole("link", { name: new RegExp(createdEvent.eventCode) }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: new RegExp(createdEvent.eventCode) })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/banquets\\?event=${createdEvent.id}`),
  );
});

test("Reservation user can create and edit a Function Space with valid enum values", async ({
  page,
}) => {
  await login(
    page,
    "reservation@rainwood.demo",
    "/rainwood/admin/function-spaces",
  );
  await expect(page).toHaveURL(`${frontendUrl}/admin/function-spaces`);
  const spaceName = `Synthetic Lawn ${Date.now()}`;
  const code = `LAWN-${Date.now()}`;
  await page.getByLabel("Name").fill(spaceName);
  await page.getByLabel("Code").fill(code);
  await page.getByLabel("Space type").selectOption("LAWN");
  await page.getByLabel("Theatre capacity").fill("80");
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByText("Function space created.")).toBeVisible();
  const row = page.locator("tr").filter({ hasText: code }).first();
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill(`${spaceName} Updated`);
  await page.getByLabel("Space type").selectOption("BANQUET_HALL");
  await page.getByLabel("Theatre capacity").fill("120");
  const patchPromise = page.waitForRequest(
    (request) =>
      request.method() === "PATCH" &&
      request.url().includes("/api/v1/function-spaces/"),
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  const patchBody = JSON.parse((await patchPromise).postData() ?? "{}");
  expect(patchBody).not.toHaveProperty("hotelId");
  await expect(page.getByText("Function space updated.")).toBeVisible();
  await expect(page.getByText(`${spaceName} Updated`)).toBeVisible();
});

test("Global role Group deep-link selects the Group hotel and validates its scoped option", async ({
  page,
}) => {
  const linkOptionsRequest = page.waitForRequest((request) =>
    request
      .url()
      .includes(`/api/v1/banquets/link-options?hotelId=${fixture.hotelBId}`),
  );
  await login(
    page,
    "admin@rainwood.demo",
    `/rainwood/admin/banquets?hotelId=${fixture.hotelBId}&groupId=${fixture.groupBId}`,
  );
  await expect(
    page.getByRole("heading", { name: "Create banquet event" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(
      `/admin/banquets\\?hotelId=${fixture.hotelBId}&groupId=${fixture.groupBId}`,
    ),
  );
  await linkOptionsRequest;
});

test("Accounts and Viewer can select a hotel and inspect banquet details without mutations", async ({
  page,
}) => {
  for (const email of ["accounts@rainwood.demo", "viewer@rainwood.demo"]) {
    await page.context().clearCookies();
    await login(page, email);
    await expect(
      page.getByRole("heading", { name: "Banquets & Events" }),
    ).toBeVisible();
    await expect(page.getByText("Read-only role:")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Create banquet event" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Event hotel")).toBeVisible();
    await page
      .getByLabel("Event hotel")
      .selectOption({ label: "RainWood Aurum Kodaikanal" });
    await expect(page.locator(".banquetTable tbody tr").first()).toContainText(
      "RainWood Aurum Kodaikanal",
    );
    await expect(
      page.getByRole("button", { name: "Open" }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open" }).first().click();
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save event details" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Cancel event" }),
    ).toHaveCount(0);
  }
});
