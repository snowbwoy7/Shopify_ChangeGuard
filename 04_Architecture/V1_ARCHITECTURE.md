# V1 Architecture

Shopify Admin → ChangeGuard embedded app → Operation API → Change Planner → Scanner / Validator / Diff → Approval Gate → Execution Worker → Shopify GraphQL Admin API → Verification → Operation Log

## Principle
Architecture follows validated product requirements. Backend services, queues, AI, agents, and additional infrastructure are introduced only when the product requires them.

## Security
- Least-privilege Shopify scopes
- Server-side authorization
- Secrets never exposed to the browser
- Request validation
- Idempotency/replay protection
- Rate limiting
- Audit logging
- Secure webhook verification where applicable
- Environment separation
