# ChangeGuard V1 — Two-Job Product Design

Date: 2026-11-24
Status: Proposed design — pending product approval
Product: Shopify ChangeGuard

## 1. Intent

ChangeGuard should solve two closely related Shopify merchant jobs exceptionally well:

1. Make permanent bulk price changes without manually editing products or spreadsheets.
2. Run temporary promotional price campaigns with a defined start/end time and automatically restore the pre-campaign prices.

The product should be simple enough for an ordinary Shopify merchant to understand immediately. Its existing safety architecture remains important, but safety is a supporting capability rather than the primary product category.

Working promise:

> Bulk price changes and scheduled promotions for Shopify — simple, controlled, and verifiable.

Core experience:

Select → Define → Preview → Approve → Execute/Schedule → Verify → History

## 2. Goals

### Permanent price changes

Support:
- percentage increase/decrease
- fixed amount increase/decrease
- product selection/filtering
- deterministic before/after preview
- explicit approval before writes
- controlled Shopify execution
- conflict detection
- post-write verification
- operation history

Example:
Select products → +10% → Preview → Approve → Apply → Verify

### Promotional campaigns

Support:
- select products
- percentage discount
- scheduled start
- scheduled end
- preview of promotional prices
- explicit approval
- automatic start
- automatic restoration of the original prices
- verification of both promotional write and restoration
- operation/campaign history

Example:
Select products → 20% OFF → Friday → Monday → Preview → Approve → Schedule

The system must preserve the prices that existed immediately before the promotional campaign so restoration does not depend on recalculating the original price.

## 3. Non-goals

V1 will not become:
- a Matrixify replacement
- a general CSV import/export tool
- an inventory management system
- a general metafield management platform
- a competitor price tracker
- a dynamic pricing engine
- an AI agent
- a multi-store agency platform
- a general catalog automation platform

These may only be added later if validated customer demand justifies them.

## 4. Anti-goals

Do not optimize V1 for feature count.

Do not introduce AI, agents, complex rules engines, recurring pricing rules, or broad catalog operations merely because the architecture can support them.

Do not compete by reproducing every feature of established bulk editors.

Do not expose safety machinery as unnecessary complexity to the merchant.

## 5. Product boundary

The V1 product has two visible jobs.

### Job A — Change prices

A merchant wants to permanently change prices across a selected group of products.

Inputs:
- operation: percentage or fixed amount
- value
- selected products/variants through supported filters

Output:
- exact before/after preview
- validation results
- approved execution
- verification
- history

### Job B — Run a promotion

A merchant wants prices discounted for a limited period.

Inputs:
- selected products/variants through supported filters
- discount percentage
- start date/time
- end date/time

Output:
- exact before/promotional-price preview
- validation results
- approved scheduled campaign
- automatic promotional execution
- automatic restoration from preserved original-price snapshots
- verification
- history

The two jobs share product selection, price calculation, preview, approval, execution, verification, and history.

## 6. Safety and correctness requirements

The existing deterministic price-plan and execution architecture should be reused rather than replaced.

For every write:
- never write until the merchant has explicitly approved the operation
- retain the approved plan/hash so execution is tied to the reviewed plan
- re-read relevant Shopify prices before mutation
- detect conflicts between approved before-prices and current Shopify prices
- avoid silently overwriting changed prices
- use controlled batch mutation behavior
- verify persisted values after writes
- record execution outcome in history

For promotional restoration:
- store the exact pre-promotion price for every affected variant
- restoration must use the stored snapshot, not a recalculated value
- restoration must also verify the resulting Shopify price
- if a merchant has intentionally changed a promotional price while the campaign is active, the system must not silently overwrite that newer value during restoration; it should surface a conflict and stop/skip safely according to the implementation decision.

## 7. Promotion lifecycle

A promotion should have an explicit lifecycle rather than being treated as a normal price-change operation with a timer attached.

Proposed states:

draft → approved → scheduled → active → restoring → completed

Failure/conflict states should be represented explicitly where needed.

### Scheduling

Before scheduling:
1. Shopify products/variants are read.
2. Promotional prices are calculated.
3. Merchant reviews the preview.
4. Merchant approves.
5. Original prices are persisted as the restoration snapshot.
6. Campaign becomes scheduled.

### Start

At the scheduled start:
1. Re-check relevant variants.
2. Detect changes since approval.
3. Apply promotional prices.
4. Verify persisted promotional prices.
5. Mark campaign active.

### End

At the scheduled end:
1. Re-read current prices.
2. Compare them with the expected promotional prices.
3. Restore only variants that still match the campaign's expected promotional state.
4. If a current price differs because something else changed it, flag a restoration conflict rather than overwriting it blindly.
5. Verify restored prices.
6. Mark campaign completed when restoration succeeds.

## 8. Existing architecture to preserve

The current codebase already contains:
- deterministic percentage/fixed price calculation
- before/after preview generation
- persisted operations
- approval tokens and plan hashes
- controlled execution
- current-price conflict detection
- post-write verification
- operation events/history

These should remain the foundation.

The implementation should extend the architecture rather than duplicate it.

## 9. Data model direction

The existing Operation model should be reused where practical.

Promotion-specific persistence will need to represent at least:
- campaign identity
- selected operation/input
- approved plan
- schedule start/end
- campaign state
- original-price restoration snapshot
- expected promotional prices
- execution/restoration timestamps
- conflicts/failure information
- audit/history events

The exact table structure is an implementation decision unless the existing architecture makes a specific choice necessary.

## 10. Product UX direction

The merchant should encounter two obvious actions:

- Change Prices
- Run a Promotion

The first screen should communicate the outcome rather than the internal safety architecture.

Preferred language:
- Change prices
- Discount products
- Preview changes
- Schedule promotion
- Apply now
- Restore original prices
- Verify changes
- View history

Avoid technical language such as execution token, plan hash, or mutation unless needed for an error or audit detail.

## 11. Pricing

Public pricing is intentionally not locked by this design.

A low-cost entry point, potentially around $3/month, is a hypothesis to validate with merchants. Pricing should be based on observed usage, willingness to pay, competitor positioning, and retention rather than assumed in the V1 architecture.

## 12. Success criteria

Before broad expansion, validate:

1. Merchants understand the two jobs without explanation.
2. Merchants can complete a permanent bulk price change successfully.
3. Merchants can create and schedule a promotion successfully.
4. Promotional restoration works reliably.
5. Merchants trust the preview and execution behavior.
6. At least 5 real Shopify users actively test the product.
7. At least one user is willing to pay for the product.
8. Repeated feedback identifies the same valuable jobs/features.

If users consistently ask for unrelated catalog operations, reassess scope instead of automatically adding them.

## 13. Validation checkpoint

Continue when merchants repeatedly use one or both jobs and show willingness to pay.

Pivot only if evidence shows that these jobs are already adequately served for the target merchants or that another adjacent problem is materially more painful.

Guiding principle:

> We do not build because we can. We build because the market gives us a reason.

## 14. Implementation notes for the builder

The builder should:
- preserve the existing security boundary
- avoid Prisma and retain the current Drizzle direction
- keep production dependencies free of known avoidable vulnerabilities
- design scheduled execution using the project's chosen durable scheduling/background mechanism
- make campaign start/end processing idempotent so retries cannot duplicate or corrupt price changes
- ensure restoration snapshots are immutable once the promotion is approved
- keep merchant-visible errors actionable
- add automated tests for calculation, scheduling state transitions, conflict handling, restoration, idempotency, and verification

The implementation plan should be written after this design is approved.
