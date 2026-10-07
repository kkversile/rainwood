import assert from "node:assert/strict";
import test from "node:test";
import {
  adminLinks,
  buildNavigationGroups,
  canAccessAdminRoute,
  isAdminRouteActive,
  linksForRole,
} from "../src/components/Shell";
import {
  bookingCurveAxisLabels,
  bookingCurveX,
  recommendationLabel,
  scopedRevenueForecastHotels,
} from "../src/components/RevenueForecast";

const asAdminLinks = (role: string) => {
  const allowed = new Set(linksForRole(role).map(([href]) => href));
  return adminLinks.filter((item) => allowed.has(item.href));
};

test("grouped admin navigation keeps the requested information architecture", () => {
  const groups = buildNavigationGroups(asAdminLinks("SUPER_ADMIN"));
  assert.deepEqual(
    groups.map((group) => group.label),
    [
      "Operations",
      "Reservations",
      "Revenue",
      "CRM & Sales",
      "Reports",
      "System",
    ],
  );
  assert.deepEqual(
    groups[0].items.map((item) => item.label),
    [
      "Rooms & Inventory",
      "Physical Rooms",
      "Room Rack",
      "Housekeeping",
      "Maintenance",
      "Operations Logbook",
      "Banquets & Events",
      "Function Spaces",
      "Supplementary Charges",
      "Expenses",
      "Service Items",
      "Cashier Shift",
    ],
  );
  assert.deepEqual(
    groups[1].items.map((item) => item.label),
    [
      "Reservations",
      "Groups & Room Blocks",
      "Front Desk",
      "Arrivals",
      "In-house",
      "Lost & Found",
      "Payments",
      "Contact Requests",
    ],
  );
  assert.deepEqual(
    groups[2].items.map((item) => item.label),
    [
      "Revenue Forecast",
      "Rate Plans",
      "Rate Calendar",
      "Rate Seasons",
      "Yield Rules",
      "Rate Simulator",
      "Promotions",
      "Rate Import",
    ],
  );
  assert.deepEqual(
    groups[3].items.map((item) => item.label),
    ["Guests", "Agent Rate Slabs", "Corporates", "Inquiries"],
  );
  assert.deepEqual(
    groups[4].items.map((item) => item.label),
    ["Reports", "Tax Invoices", "Credit Notes", "TDS Register", "Night Audit"],
  );
  assert.deepEqual(
    groups[5].items.map((item) => item.label),
    [
      "Tax Settings",
      "AxisRooms",
      "Jobs",
      "Users",
      "Site Settings",
      "Features",
      "Audit Logs",
    ],
  );
});

test("role filtering is fail-closed and groups only allowed links", () => {
  assert.deepEqual(linksForRole(), []);
  assert.deepEqual(linksForRole("NOT_A_ROLE"), []);
  assert.deepEqual(
    buildNavigationGroups(asAdminLinks("RESERVATION")).map(
      (group) => group.label,
    ),
    ["Operations", "Reservations", "CRM & Sales", "Reports"],
  );
  assert.equal(
    buildNavigationGroups(asAdminLinks("ADMIN")).some(
      (group) =>
        group.key === "system" &&
        group.items.some((item) => item.label === "Hotels"),
    ),
    false,
  );
  assert.equal(
    buildNavigationGroups(asAdminLinks("CORPORATE_ADMIN")).some((group) =>
      group.items.some((item) => item.label === "Site Settings"),
    ),
    false,
  );
});

test("header and operations command permissions share the admin route metadata", () => {
  assert.equal(canAccessAdminRoute("ACCOUNTS", "/admin/reservations"), false);
  assert.equal(canAccessAdminRoute("VIEWER", "/admin/contact-requests"), false);
  assert.equal(
    canAccessAdminRoute("SERVICE_STAFF", "/admin/reservations"),
    false,
  );
  assert.equal(canAccessAdminRoute("RESERVATION", "/admin/reservations"), true);
  assert.equal(canAccessAdminRoute("RESERVATION", "/admin/logbook"), true);
  assert.equal(canAccessAdminRoute("VIEWER", "/admin/logbook"), true);
  assert.equal(canAccessAdminRoute("SERVICE_STAFF", "/admin/logbook"), false);
  assert.equal(canAccessAdminRoute("ADMIN", "/admin/contact-requests"), true);
  assert.equal(
    canAccessAdminRoute("SUPER_ADMIN", "/admin/contact-requests"),
    true,
  );
});

test("active route matching handles nested pages without prefix collisions", () => {
  assert.equal(isAdminRouteActive("/admin/rates/2026", "/admin/rates"), true);
  assert.equal(
    isAdminRouteActive("/admin/rate-seasons/2026", "/admin/rates"),
    false,
  );
  assert.equal(isAdminRouteActive("/admin/guests/123", "/admin/guests"), true);
  assert.equal(
    isAdminRouteActive("/admin/reservations/123", "/admin/reservations"),
    true,
  );
  assert.equal(
    isAdminRouteActive("/admin/dashboard/details", "/admin/dashboard"),
    false,
  );
});

test("revenue forecast keeps global roles multi-property and property Admin fixed to scope", () => {
  const hotels = [
    { id: "hotel-a", name: "Hotel A" },
    { id: "hotel-b", name: "Hotel B" },
  ];
  assert.deepEqual(
    scopedRevenueForecastHotels({ role: "SUPER_ADMIN" }, hotels),
    hotels,
  );
  assert.deepEqual(
    scopedRevenueForecastHotels({ role: "CORPORATE_ADMIN" }, hotels),
    hotels,
  );
  assert.deepEqual(
    scopedRevenueForecastHotels(
      { role: "ADMIN", staffHotelId: "hotel-b" },
      hotels,
    ),
    [hotels[1]],
  );
  assert.deepEqual(scopedRevenueForecastHotels({ role: "ADMIN" }, hotels), []);
});

test("booking curve uses actual lead-time spacing and meaningful axis labels", () => {
  const observations = [90, 60, 14, 7, 0].map((daysBeforeArrival) => ({
    daysBeforeArrival,
  }));
  const xs = observations.map((observation) =>
    bookingCurveX(observation.daysBeforeArrival, observations),
  );
  assert.deepEqual(
    xs.map((value) => Number(value.toFixed(4))),
    [4, 34.6667, 81.6889, 88.8444, 96],
  );
  assert.ok(xs[1] - xs[0] > xs[3] - xs[2]);
  assert.equal(bookingCurveX(10, [{ daysBeforeArrival: 10 }]), 50);
  assert.deepEqual(
    bookingCurveAxisLabels(observations).map((label) => label.value),
    [90, 60, 30, 14, 7, 0],
  );
});

test("revenue recommendation labels cover strong, hold, soft, and insufficient states", () => {
  assert.equal(
    recommendationLabel({ type: "REVIEW_STRONG_UPWARD" }),
    "Review upward",
  );
  assert.equal(recommendationLabel({ type: "HOLD_RATE" }), "Hold rate");
  assert.equal(
    recommendationLabel({ type: "REVIEW_SOFT_DEMAND" }),
    "Soft demand",
  );
  assert.equal(
    recommendationLabel({ type: "INSUFFICIENT_DATA" }),
    "Insufficient data",
  );
});
