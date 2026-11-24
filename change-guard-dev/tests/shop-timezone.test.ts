import assert from "node:assert/strict";
import { describeTimeZone, localDateTimeToUtcIso } from "../app/lib/shop-timezone";

assert.equal(
  localDateTimeToUtcIso("2026-12-15T10:30", "Africa/Lagos"),
  "2026-12-15T09:30:00.000Z",
);

assert.equal(
  localDateTimeToUtcIso("2026-07-15T10:30", "America/New_York"),
  "2026-07-15T14:30:00.000Z",
);

assert.equal(
  describeTimeZone("Africa/Lagos", "WAT"),
  "Africa/Lagos (WAT)",
);

assert.throws(
  () => localDateTimeToUtcIso("not-a-date", "Africa/Lagos"),
  /valid date and time/i,
);

assert.throws(
  () => localDateTimeToUtcIso("2026-12-15T10:30", "Not/AZone"),
  /timezone is invalid/i,
);

console.log("shop-timezone tests passed");
