import type { PromotionStatus } from "./promotion-store.server";

export function assertPromotionSchedule(
  startAt: string,
  endAt: string,
  now = new Date(),
): void {
  const start = new Date(startAt);
  const end = new Date(endAt);

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new Error("Promotion schedule contains invalid dates.");
  }

  if (start.getTime() <= now.getTime()) {
    throw new Error("Promotion start time must be in the future.");
  }

  if (end.getTime() <= start.getTime()) {
    throw new Error("Promotion end time must be after the start time.");
  }
}

export function nextPromotionStatus(
  current: PromotionStatus,
  event: "approve" | "schedule" | "start" | "begin_restore" | "complete" | "conflict" | "fail",
): PromotionStatus {
  const transitions: Record<PromotionStatus, Partial<Record<typeof event, PromotionStatus>>> = {
    draft: { approve: "approved", fail: "failed" },
    approved: { schedule: "scheduled", fail: "failed" },
    scheduled: { start: "active", conflict: "conflict", fail: "failed" },
    active: { begin_restore: "restoring", conflict: "conflict", fail: "failed" },
    restoring: { complete: "completed", conflict: "conflict", fail: "failed" },
    completed: {},
    conflict: {},
    failed: {},
  };

  const next = transitions[current][event];

  if (!next) {
    throw new Error(`Invalid promotion transition: ${current} + ${event}.`);
  }

  return next;
}
