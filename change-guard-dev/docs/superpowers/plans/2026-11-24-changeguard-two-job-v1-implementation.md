# ChangeGuard V1 — Two-Job Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend ChangeGuard from a permanent price-change preview/execution flow into a focused two-job V1: permanent bulk price changes and scheduled promotional campaigns with verified automatic restoration.

**Architecture:** Preserve the existing deterministic price-plan, approval/hash, conflict detection, controlled mutation, verification, and history machinery. Add a promotion domain layer that creates an immutable pre-promotion snapshot, schedules idempotent start/end processing, and reuses the existing Shopify price executor patterns for both promotional writes and safe restoration. Keep merchant UX centered on “Change Prices” and “Run a Promotion”, while hiding implementation security machinery unless an error/audit detail requires it.

**Tech Stack:** React Router 7.18.6, React/TypeScript, Shopify Admin GraphQL, Drizzle ORM 0.45.4 with LibSQL, existing Shopify React Router authentication/session storage, Vite/Vite-Node tests.

**Spec:** `change-guard-dev/docs/superpowers/specs/2026-11-24-changeguard-two-job-v1-design.md`

## Global Constraints

- Preserve the existing Drizzle direction; do not reintroduce Prisma.
- Never write Shopify prices before explicit merchant approval.
- Execution must remain tied to the approved plan/hash and re-read current Shopify prices before mutation.
- Never silently overwrite a price changed after approval.
- Promotional restoration must use immutable stored pre-promotion prices, not recalculation.
- Promotional start/end processing must be idempotent so retries cannot duplicate or corrupt price changes.
- Verify persisted Shopify prices after every write.
- Keep merchant-visible language focused on prices, promotions, preview, approval, scheduling, restoration, verification, and history.
- Do not add AI, agents, generic CSV/catalog tooling, inventory management, competitor tracking, dynamic pricing, or agency/multi-store scope in V1.
- Avoid new production dependencies unless a concrete runtime requirement justifies them.
- Keep production dependencies free of known avoidable vulnerabilities.

## Review Focus

- A merchant changes a price after approving a promotion but before its scheduled start; the campaign must detect the conflict and avoid silently overwriting the newer price. Test in the promotion-start task.
- A campaign start/end worker is retried after partial completion; the same variant must not be changed twice incorrectly. Test idempotency in the lifecycle task.
- A merchant changes a promotional price while a campaign is active; restoration must detect the mismatch and avoid blindly restoring the old value. Test restoration conflict handling.
- A campaign is approved with variants that later disappear from Shopify; processing must report the missing variant rather than silently treating it as restored/applied. Test lifecycle execution.
- A scheduled campaign has an invalid or already-expired time relationship; the system must reject it before scheduling rather than creating an unusable campaign. Test validation in the promotion domain task.

---

## Task 1: Define promotion domain types and deterministic pricing

**Files:**
- Create: `change-guard-dev/app/lib/promotion-plan.ts`
- Test: `change-guard-dev/tests/promotion-plan.test.ts`

**Interfaces:**
- Consumes: `ProductSnapshot`, `VariantSnapshot`, and existing money-normalization conventions from `app/lib/change-plan.ts`.
- Produces: `PromotionInput`, `PromotionPlan`, immutable per-variant original-price snapshot data, expected promotional prices, and deterministic validation results for later persistence/execution tasks.

- [ ] **Step 1: Write failing tests** for:
  - 20% discount converts `100.00` to `80.00`.
  - rounding produces two-decimal prices.
  - a 100% discount is allowed only when the resulting price remains valid under the product rules.
  - discounts that would create invalid prices are reported as plan errors.
  - the plan preserves the exact normalized original price for every affected variant.
  - invalid start/end ordering is rejected by promotion input validation.

- [ ] **Step 2: Run the focused test** with `npm run test` after wiring the new test into the existing test script, or directly with the repository's Vite-Node test runner during development. Confirm the new tests fail before implementation.

- [ ] **Step 3: Implement** `buildPromotionPlan(products, input)` and the supporting types in `promotion-plan.ts`.
  The plan should contain campaign input, scan/change/error counts, preview rows, exact original prices, exact expected promotional prices, and normalized schedule values. Do not reuse a recalculated price as a restoration source.

- [ ] **Step 4: Run the focused promotion-plan tests** and confirm PASS.

- [ ] **Step 5: Commit** with a focused message such as `feat: add deterministic promotion planning`.

---

## Task 2: Extend persistence for promotion lifecycle and restoration snapshots

**Files:**
- Modify: `change-guard-dev/app/schema.ts`
- Create: `change-guard-dev/app/lib/promotion-store.server.ts`
- Create/modify: `change-guard-dev/db/migrations/*` using the repository's established Drizzle migration mechanism
- Test: `change-guard-dev/tests/promotion-store.test.ts`

**Interfaces:**
- Consumes: `PromotionPlan` from Task 1 and existing operation/event persistence patterns in `app/lib/operation-store.server.ts`.
- Produces: functions to create a promotion draft, approve/persist the immutable snapshot, read campaign state, atomically claim lifecycle work, and record lifecycle events for Tasks 3–5.

- [ ] **Step 1: Inspect and mirror the existing operation-store transaction and event patterns** before writing the new store. Keep ownership scoped by Shopify `shop`.

- [ ] **Step 2: Write failing persistence tests** covering:
  - a promotion stores its schedule and plan.
  - approval persists the exact original-price snapshot.
  - approved snapshots cannot be mutated by later campaign processing.
  - state transitions reject invalid transitions.
  - lifecycle claims are atomic/idempotent enough to prevent duplicate processing.
  - campaign history events record start, activation, restoration, conflict, completion, and failure outcomes.

- [ ] **Step 3: Add the minimum schema needed for promotion-specific state.** Prefer a dedicated `Promotion` table plus a promotion snapshot/event structure rather than overloading `Operation` with unrelated lifecycle fields. Store variant ID, original price, expected promotional price, and campaign identity in the snapshot records.

- [ ] **Step 4: Add a Drizzle migration** and update the local database initialization path used by the project.

- [ ] **Step 5: Implement store functions** with explicit state-transition and shop-ownership checks. Do not expose raw SQL or internal token/hash details to UI callers.

- [ ] **Step 6: Run the focused persistence tests** and typecheck. Confirm PASS.

- [ ] **Step 7: Commit** with a focused message such as `feat: persist promotion lifecycle and snapshots`.

---

## Task 3: Refactor shared price execution for reusable promotion start/restoration

**Files:**
- Modify: `change-guard-dev/app/lib/price-operation-executor.ts`
- Create: `change-guard-dev/app/lib/price-execution.server.ts` only if extraction is required to avoid duplicating Shopify GraphQL mutation/read/verify logic
- Test: `change-guard-dev/tests/price-operation-executor.test.ts`
- Test: `change-guard-dev/tests/promotion-executor.test.ts`

**Interfaces:**
- Consumes: existing `ChangePlan` execution behavior plus promotion snapshot rows from Task 2.
- Produces:
  - a shared read-current-price primitive;
  - controlled bulk price mutation;
  - post-write verification;
  - safe conflict detection against an approved expected price;
  - restoration execution that uses stored snapshot prices.

- [ ] **Step 1: Add failing tests** for shared execution behavior:
  - current price equals approved before-price → eligible to update.
  - current price already equals target price → idempotent no-op.
  - current price differs from both approved before and target → conflict.
  - successful mutation is followed by verification.
  - restoration uses the snapshot original price, never a recalculated price.

- [ ] **Step 2: Run the focused executor tests** and confirm the new behavior fails before implementation.

- [ ] **Step 3: Extract or extend the existing executor** so permanent changes and promotion lifecycle processing share the same Shopify GraphQL read/update/verify primitives. Preserve `allowPartialUpdates: false` and the current conflict semantics.

- [ ] **Step 4: Implement promotion-start execution** against the approved campaign snapshot. Each variant must be re-read immediately before mutation and compared with its approved original price.

- [ ] **Step 5: Implement promotion-restoration execution** so only variants still matching the campaign's expected promotional price are restored. A mismatch becomes a restoration conflict rather than an overwrite.

- [ ] **Step 6: Add idempotency behavior** for retry cases where a previous write already reached Shopify but the worker failed before recording completion.

- [ ] **Step 7: Run focused executor tests plus the existing price-operation tests.** Confirm PASS.

- [ ] **Step 8: Commit** with a focused message such as `feat: add safe promotion price execution`.

---

## Task 4: Add promotion approval and lifecycle state transitions

**Files:**
- Create: `change-guard-dev/app/routes/app.promotions.new.tsx`
- Create: `change-guard-dev/app/routes/app.promotions.$promotionId.approve.tsx`
- Create: `change-guard-dev/app/lib/promotion-lifecycle.server.ts`
- Test: `change-guard-dev/tests/promotion-lifecycle.test.ts`

**Interfaces:**
- Consumes: promotion planning from Task 1, persistence from Task 2, and safe execution from Task 3.
- Produces: merchant-facing promotion creation/preview, explicit approval, and lifecycle transition functions used by the scheduler.

- [ ] **Step 1: Write failing lifecycle tests** for:
  - draft → approved only after exact plan/snapshot persistence.
  - approved → scheduled only with a valid future schedule.
  - scheduled → active only once start processing succeeds.
  - active → restoring only once end processing begins.
  - restoring → completed only after restoration verification succeeds.
  - conflict/failure states are recorded without pretending the campaign completed.
  - invalid transitions are rejected.

- [ ] **Step 2: Run the lifecycle tests** and confirm failure.

- [ ] **Step 3: Implement the lifecycle service** with explicit transition functions. Keep transition rules out of React route components.

- [ ] **Step 4: Build the “Run a Promotion” route** with:
  - product scope selection matching the supported filters;
  - discount percentage;
  - start/end date and time;
  - deterministic preview;
  - validation summary;
  - clear approval/scheduling action.

- [ ] **Step 5: Build the approval route** so approval binds the campaign to the reviewed plan and snapshot. Approval must be explicit and must not immediately mutate Shopify prices.

- [ ] **Step 6: Run lifecycle tests, typecheck, and lint.** Confirm PASS.

- [ ] **Step 7: Commit** with a focused message such as `feat: add promotion approval lifecycle`.

---

## Task 5: Add durable scheduled processing

**Files:**
- Create: `change-guard-dev/app/routes/internal.promotions.process.ts` (or the equivalent protected server route if the repository's routing convention requires a different name)
- Create: `change-guard-dev/app/lib/promotion-processor.server.ts`
- Modify: deployment configuration only where the chosen scheduler requires it
- Test: `change-guard-dev/tests/promotion-processor.test.ts`

**Interfaces:**
- Consumes: scheduled campaign records and lifecycle transitions from Tasks 2–4; shared execution from Task 3.
- Produces: an idempotent processor that claims due campaigns and performs start/restoration work.

- [ ] **Step 1: Choose and document the deployment scheduler** after checking the actual production deployment target. The scheduler must invoke a protected server endpoint at a short enough interval to support the product's scheduling promise. Do not rely on an in-process Node timer, because process restarts must not lose campaigns.

- [ ] **Step 2: Write failing processor tests** for:
  - a due scheduled campaign is claimed once.
  - an already-processing/completed campaign is not duplicated.
  - a scheduled campaign whose start time is reached runs start processing.
  - an active campaign whose end time is reached runs restoration.
  - retry after an interrupted attempt safely resumes.
  - unrelated shops cannot process another shop's campaign.

- [ ] **Step 3: Implement the protected processor endpoint** with authentication/secret verification appropriate to the deployment environment.

- [ ] **Step 4: Implement campaign claiming and processing** using database state rather than memory. Keep start and end operations idempotent.

- [ ] **Step 5: Add structured lifecycle events and actionable failure/conflict messages.**

- [ ] **Step 6: Run processor tests plus typecheck/lint.** Confirm PASS.

- [ ] **Step 7: Commit** with a focused message such as `feat: add durable promotion scheduler`.

---

## Task 6: Rework the main merchant UX around the two visible jobs

**Files:**
- Modify: `change-guard-dev/app/routes/app._index.tsx`
- Create: `change-guard-dev/app/routes/app.price-changes.new.tsx` only if separating the current form improves route boundaries without duplicating logic
- Test: `change-guard-dev/tests/app-ui-contract.test.ts` if the repository's test approach supports route-level assertions

**Interfaces:**
- Consumes: existing permanent price-change flow plus promotion route/lifecycle from Tasks 1–5.
- Produces: a first screen with two obvious jobs and merchant language that describes outcomes rather than internal security machinery.

- [ ] **Step 1: Write/adjust UI tests or route-level assertions** for the visible labels:
  - `Change Prices`
  - `Run a Promotion`
  - preview/change language
  - schedule/restoration language.

- [ ] **Step 2: Refactor the home route** so the first decision is between the two jobs. Preserve the working permanent price-change flow rather than rewriting its calculation/execution engine.

- [ ] **Step 3: Move technical details such as plan hashes and execution terminology out of the primary merchant workflow.** Keep useful error/audit detail available where necessary.

- [ ] **Step 4: Add navigation to promotion creation and clear status/history access.

- [ ] **Step 5: Run typecheck/lint and the complete test suite.** Confirm PASS.

- [ ] **Step 6: Commit** with a focused message such as `feat: center ChangeGuard on two merchant jobs`.

---

## Task 7: Add campaign history and merchant-visible verification outcomes

**Files:**
- Modify: `change-guard-dev/app/lib/operation-store.server.ts` only where shared history is appropriate
- Create: `change-guard-dev/app/routes/app.promotions.$promotionId.tsx`
- Create/modify: `change-guard-dev/app/routes/app.history.tsx` if a history route does not already exist
- Test: `change-guard-dev/tests/promotion-history.test.ts`

**Interfaces:**
- Consumes: lifecycle events and execution outcomes from Tasks 2–5.
- Produces: merchant-readable history for permanent changes and promotions, including scheduled/active/completed/conflict/failed states and verification outcomes.

- [ ] **Step 1: Write failing history tests** asserting that completed promotions show start, restoration, and verification outcomes and that conflicts remain visible rather than being represented as success.

- [ ] **Step 2: Implement the promotion detail/history view** using existing event records and persisted campaign state.

- [ ] **Step 3: Add shared history navigation without exposing secrets, approval tokens, or raw internal hashes.

- [ ] **Step 4: Run history tests plus the complete suite.** Confirm PASS.

- [ ] **Step 5: Commit** with a focused message such as `feat: add promotion history and verification`.

---

## Task 8: End-to-end verification and production readiness

**Files:**
- Modify: `change-guard-dev/tests/*` only for missing regression coverage
- Modify: `change-guard-dev/README.md` or existing docs
- Modify: deployment configuration only where verified necessary

**Interfaces:**
- Consumes: the complete two-job V1.
- Produces: verified build/test/typecheck/lint results and documented deployment/configuration requirements.

- [ ] **Step 1: Run the complete automated test suite.** Expected: all existing and new tests PASS.

- [ ] **Step 2: Run typecheck.** Expected: `npm run typecheck` exits successfully.

- [ ] **Step 3: Run lint.** Expected: `npm run lint` exits successfully.

- [ ] **Step 4: Run production build.** Expected: `npm run build` exits successfully.

- [ ] **Step 5: Run a dependency/security audit without using `npm audit fix --force`.** Expected: no newly introduced avoidable vulnerability and no regression of the previously achieved zero-vulnerability production audit.

- [ ] **Step 6: Perform the manual Shopify dev-store verification for both jobs:
  - create a permanent percentage change and confirm preview → approval → execution → verification;
  - create a scheduled promotion and confirm preview → approval → scheduling;
  - confirm automatic start;
  - confirm automatic restoration;
  - intentionally change a promotional price during the campaign and confirm restoration reports a conflict instead of overwriting it.

- [ ] **Step 7: Update documentation** with merchant workflow, scheduler configuration, operational recovery behavior, known limitations, and test commands.

- [ ] **Step 8: Commit the final verification/documentation changes** with a focused message such as `docs: document ChangeGuard V1 operations`.

- [ ] **Step 9: Request code review** for the completed branch before any merge.

---

## Execution Order

Implement Tasks 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 in order.

Task 3 depends on the persisted promotion snapshot contract from Task 2. Task 4 depends on the domain/store/execution contracts. Task 5 depends on the lifecycle state machine and execution layer. UX work follows the core behavior so the UI does not get ahead of a stable domain contract.

The implementation should remain incremental: each task ends with tests and a focused commit. Do not merge the implementation branch or the existing PR #9 without explicit user approval.
