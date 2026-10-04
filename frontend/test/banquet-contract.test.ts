import assert from "node:assert/strict";
import test from "node:test";
import {
  BANQUET_EVENT_TYPES,
  BANQUET_CHARGE_CATEGORIES,
  BANQUET_REQUIREMENT_CATEGORIES,
  BANQUET_SETUP_STYLES,
  DEFAULT_BANQUET_CHARGE_CATEGORY,
  DEFAULT_BANQUET_EVENT_TYPE,
  DEFAULT_BANQUET_REQUIREMENT_CATEGORY,
  DEFAULT_BANQUET_SETUP_STYLE,
  DEFAULT_FUNCTION_SPACE_TYPE,
  FUNCTION_SPACE_TYPES,
} from "../src/lib/banquet-contract";

test("banquet frontend enums match the backend Prisma contract", () => {
  assert.deepEqual(
    [...FUNCTION_SPACE_TYPES],
    [
      "BALLROOM",
      "BANQUET_HALL",
      "MEETING_ROOM",
      "BOARDROOM",
      "CONFERENCE_HALL",
      "LAWN",
      "TERRACE",
      "POOL_SIDE",
      "RESTAURANT_PRIVATE_ROOM",
      "OTHER",
    ],
  );
  assert.deepEqual(
    [...BANQUET_REQUIREMENT_CATEGORIES],
    [
      "FOOD_BEVERAGE",
      "AUDIO_VISUAL",
      "FURNITURE",
      "DECOR",
      "HOUSEKEEPING",
      "ENGINEERING",
      "SECURITY",
      "TRANSPORT",
      "OTHER",
    ],
  );
  assert.deepEqual(
    [...BANQUET_CHARGE_CATEGORIES],
    [
      "VENUE_RENTAL",
      "AUDIO_VISUAL",
      "FOOD_PACKAGE",
      "DECORATION",
      "EQUIPMENT",
      "MISCELLANEOUS",
    ],
  );
  assert.ok(FUNCTION_SPACE_TYPES.includes(DEFAULT_FUNCTION_SPACE_TYPE));
  assert.ok(
    BANQUET_REQUIREMENT_CATEGORIES.includes(
      DEFAULT_BANQUET_REQUIREMENT_CATEGORY,
    ),
  );
  assert.ok(
    BANQUET_CHARGE_CATEGORIES.includes(DEFAULT_BANQUET_CHARGE_CATEGORY),
  );
  assert.ok(BANQUET_EVENT_TYPES.includes(DEFAULT_BANQUET_EVENT_TYPE));
  assert.ok(BANQUET_SETUP_STYLES.includes(DEFAULT_BANQUET_SETUP_STYLE));
});
