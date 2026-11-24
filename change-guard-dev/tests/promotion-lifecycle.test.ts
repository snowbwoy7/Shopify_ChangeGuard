import assert from "node:assert/strict";
import {
  assertPromotionSchedule,
  nextPromotionStatus,
} from "../app/lib/promotion-lifecycle.server";

const now = new Date("2026-11-24T10:00:00.000Z");

assert.doesNotThrow(() =>
  assertPromotionSchedule(
    "2026-11-25T10:00:00.000Z",
    "2026-11-28T10:00:00.000Z",
    now,
  ),
);

assert.throws(
  () =>
    assertPromotionSchedule(
      "2026-11-24T09:00:00.000Z",
      "2026-11-28T10:00:00.000Z",
      now,
    ),
  /start time must be in the future/,
);

assert.throws(
  () =>
    assertPromotionSchedule(
      "2026-11-25T10:00:00.000Z",
      "2026-11-25T09:00:00.000Z",
      now,
    ),
  /end time must be after the start time/,
);

assert.equal(nextPromotionStatus("draft", "approve"), "approved");
assert.equal(nextPromotionStatus("approved", "schedule"), "scheduled");
assert.equal(nextPromotionStatus("scheduled", "start"), "active");
assert.equal(nextPromotionStatus("active", "begin_restore"), "restoring");
assert.equal(nextPromotionStatus("restoring", "complete"), "completed");

assert.throws(
  () => nextPromotionStatus("completed", "start"),
  /Invalid promotion transition/,
);

console.log("promotion-lifecycle tests passed");
