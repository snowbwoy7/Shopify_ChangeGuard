# Backend

Responsibilities:
- Authenticate Shopify requests
- Load and validate shop context
- Scan eligible products
- Calculate deterministic changes
- Generate change plans
- Require approval before writes
- Execute changes in controlled batches
- Verify results
- Persist operation history

Never trust a shop identifier supplied by the client as authorization.
