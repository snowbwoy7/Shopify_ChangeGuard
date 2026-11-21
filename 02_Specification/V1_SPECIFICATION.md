# Shopify ChangeGuard V1 Specification

## Goal
Enable a merchant to safely perform a supported bulk catalog change with a clear preview and explicit approval.

## Supported operations
1. Percentage price change
2. Fixed price change
3. Add/remove tags
4. Update one selected metafield

## Scope filters
- All products
- Collection
- Product type
- Vendor
- Tag
- Status

## Change Plan
Show operation, scope, records scanned, records that will change, exclusions, warnings/errors, and before → after values.

## Safety rules
- No write occurs before explicit approval.
- Validation is deterministic in V1.
- Execution is controlled and observable.
- Failed items must be identifiable.
- Verification follows execution.
- Operation history is retained.

## Non-goals
AI assistant, agentic execution, customer/order/payment operations, generic CSV replacement, generic bulk-editor replacement, agency/team features, and rollback claims that cannot be technically guaranteed.
