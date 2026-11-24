# ChangeGuard promotion scheduler

ChangeGuard promotions require a durable external trigger to call the protected processor endpoint. The application itself does not keep an in-memory timer.

## GitHub Actions scheduler

`.github/workflows/promotion-scheduler.yml` calls `/internal/promotions/process` every five minutes and can also be run manually.

Configure these GitHub repository settings before enabling production promotions:

- Repository variable `CHANGEGUARD_APP_URL`: the deployed ChangeGuard application origin, for example `https://app.example.com`.
- Repository secret `CHANGEGUARD_CRON_SECRET`: a long random secret that is also configured as the application `CRON_SECRET` environment variable.

The workflow sends the secret only in the `x-cron-secret` request header. Do not put the secret in the URL or source code.

## Runtime behavior

The processor is idempotency-oriented:

- only `scheduled` promotions whose start time has arrived are eligible for start processing;
- only `active` promotions whose end time has arrived are eligible for restoration;
- `scheduled -> starting` and `active -> restoring` are guarded state transitions;
- restoration uses immutable snapshots captured at approval time;
- already-restored snapshots are excluded from restoration;
- conflicts stop the affected promotion instead of silently overwriting merchant changes.

The scheduler should be treated as a trigger, not as the source of truth. A delayed or repeated trigger is expected to be safe.

## Production deployment requirement

The deployed app must expose the processor route and have `CRON_SECRET` configured. Before enabling real merchant promotions, verify one test promotion through the Shopify dev store and confirm the complete lifecycle: scheduled → starting → active → restoring → completed.

## Local development

Do not expose the processor route publicly without `CRON_SECRET`. Local testing can call the route with the same `x-cron-secret` header after the application environment is configured.