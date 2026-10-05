# Configurable CRM: review and browser verification

This guide describes the unshipped `refactor/dynamic-record-model` change. The repository contains the implementation, migrations, synthetic fixtures, browser suite and scale tools. A fresh checkout can reproduce the verification without another workstation's database, environment file, cookies, build, ignored scripts or private documentation.

## Architecture to review

Contacts, organizations, deals, services and ordinary tasks are starter configurations of one record engine. Custom types use the same record pages, tables, boards, drawers, interactors and query compiler. Stable type, field, option and relationship IDs survive renaming; presentation settings do not duplicate records.

Follow these sources through their consumers rather than reviewing the UI or schema alone:

| Concern | Sources |
| --- | --- |
| Model, typed values, relationships and configuration revisions | [schema](../../prisma/schema.prisma), [model](../../features/records/record-model.schema.ts), [configuration service](../../features/records/configuration.service.ts) |
| Validation, tenant transactions and authoritative calculations | [DI](../../core/di.ts), [write service](../../features/records/record-write.service.ts), [calculation service](../../features/records/record-calculation.service.ts) |
| Dynamic permissions and restricted values | [access policy](../../features/records/record-access.ts), [query compiler](../../features/records/record-query.ts), [recipient reader](../../features/records/record-recipient-reader.ts) |
| Indexed identifiers shared across record associations | [identity schema](../../features/records/record-identity.schema.ts), [record sources](../../features/records), [shared-channel journey](shared-channels.spec.ts) |
| Widget grain, relationship attribution and visibility | [measure schema](../../features/records/record-measure.schema.ts), [measure interactor](../../features/records/query-record-measure.interactor.ts) |
| REST/MCP parity and configuration bundles | [REST API](../../app/api/v1), [MCP tools](../../features/mcp-tools/record-model.mcp-tools.ts), [actual tool journey](record-tools.spec.ts) |
| Staging, retries, atomic publication and write pauses | [operation service](../../features/records/record-operation.service.ts), [staging repository](../../features/records/record-staging.repository.ts), [operation journey](record-operation.spec.ts) |
| Legacy upgrade | [single upgrade migration](../../prisma/migrations/20261004000000_configurable_records/migration.sql) and its [README](../../prisma/migrations/20261004000000_configurable_records/README.md), [migration database tests](../../prisma/__tests__/configurable-records-migration.database.test.ts), [populated legacy fixtures](../helpers/legacy-crm-fixture.ts) |

Review constructor injection and DI registration, thin adapters, transaction-time permission/version/revision checks, tenant-qualified references and database filtering/pagination. Inspect request ownership, hydration, form drafts, saved-view precedence, failed refreshes and focus return against the existing shared MobX stores and UI components. Keep the existing typography, tokens, form controls, overlays and single scroll owner; configuration should stay linear and concise.

Important behavior:

- Deal line items are embedded records. Duplicate services, exact quantities, live catalog prices and explicitly captured saved prices are supported. Deal quantity/value are rollups; weighted value uses stage probability. Missing probability differs from zero.
- Formula, lookup, rollup and snapshot definitions are validated backend configuration. Calculation errors are visible. Aggregation uses record identity and a declared grain; equal amounts are not duplicate records.
- Schema configuration, role administration, record access and publishing a restricted summary are separate authorities. Derived-value restrictions apply to queries, widgets, exports, history and deliveries, including retained values after manual/snapshot conversion and source archive.
- A normalized channel identifier is indexed and may have associations with several records/types. Removing an association must not delete another association or silently grant inbox access. Removing the last association deletes the canonical identity with its aliases and cached provider metadata; disabling Channels or archiving a type keeps associations for restoration. Conversation links and declared activity paths remain explicit.
- Application identity, authentication, memberships, provider connections and protected membership-task operations remain system responsibilities. Ordinary fields and renamed types cannot bypass those constraints.
- Large operations retain the previous complete readable state, pause CRM writes and publish a complete revision atomically. Failure, cancellation and retry must not leak partial values or repeat accepted mutations.
- Legacy CRUD implementations are removed. Remaining legacy names should be justified as presets, migration logic, redirects or historical read-only decoders. Do not remove preservation code simply because active CRUD is generic.

## Fresh-machine setup

Use Node `24.18.0` from `.nvmrc`, Yarn `1.22.22`, local Docker and enough disk/RAM for a production build. The complete lint hook exceeds Node's default heap; the local handoff uses an 8 GiB heap on a 24 GiB machine. Set `NODE_OPTIONS=--max-old-space-size=8192` when sufficient RAM is available, and preserve any required runtime options. Do not skip hooks after a memory failure. On Linux, install the Playwright browser dependencies. Use the exact pull-request head in a dedicated checkout and record its commit before testing; preserve any existing dirty checkout.

```sh
nvm use
yarn db:provision
cp .env.cloud.template .env
```

Set `DATABASE_URL` and `DIRECT_URL` in the new ignored `.env` to this worktree provisioner's loopback URLs. Generate a new local `BETTER_AUTH_SECRET`. Set `APP_MODE=cloud`, `HOSTED_AI_OPERATOR_CONTROLS_ENABLED=true`, `HOSTED_AI_PROVIDER_WORK_PAUSED=true` and `NEXT_TELEMETRY_DISABLED=1`. Leave real provider/model credentials absent, and clear the placeholders `NEXT_PUBLIC_SENTRY_DSN` and `AI_GATEWAY_API_KEY` (a non-empty gateway key changes the offline classifier tests). Do not copy an existing workstation `.env` or use hosted/demo/production databases.

```sh
yarn install --frozen-lockfile
yarn playwright install --with-deps chromium firefox webkit
node --env-file=.env node_modules/.bin/tsx scripts/assert-local-database-url.ts
```

The following setup creates the four new disposable databases and environment files required by the commands below: application tests, browser tests, scale and interactive review. It validates loopback scope and rejects libpq routing overrides. It writes private, ignored environment files without printing connection strings. It refuses an existing setup directory; do not overwrite a prior run's ownership record. Equivalent separately owned loopback databases and environment files may be used instead.

```sh
node --env-file=.env --import tsx --input-type=module <<'NODE'
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import { assertLocalDatabaseEnvironment } from './scripts/local-database-safety.ts';

const source = assertLocalDatabaseEnvironment(process.env);
await mkdir('.runs', { recursive: true });
await mkdir('.runs/record-review');
const client = new Client({ connectionString: source });
await client.connect();
try {
  for (const [kind, prefix] of [['db', 'crm_verify'], ['browser', 'crm_e2e'], ['scale', 'crm_scale'], ['review', 'crm_e2e']]) {
    const name = `${prefix}_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE DATABASE "${name}"`);
    const url = new URL(source);
    url.pathname = `/${name}`;
    const environment = {
      DATABASE_URL: url.toString(), DIRECT_URL: url.toString(),
      RUN_DATABASE_TESTS: 'true',
      HOSTED_AI_OPERATOR_CONTROLS_ENABLED: 'true', HOSTED_AI_PROVIDER_WORK_PAUSED: 'true',
      NEXT_TELEMETRY_DISABLED: '1',
      WORKFLOW_LOCAL_DATA_DIR: `.runs/record-review/${kind}-workflow`,
      ...(kind === 'browser' || kind === 'review' ? {
        CRM_E2E_DATABASE_URL: url.toString(),
        CRM_E2E_BASE_URL: kind === 'review' ? 'http://127.0.0.1:4137' : 'http://127.0.0.1:4127',
        BASE_URL: kind === 'review' ? 'http://127.0.0.1:4137' : 'http://127.0.0.1:4127',
        CRM_E2E_SERVER_MODE: 'production',
      } : {}),
    };
    const content = Object.entries(environment).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n');
    await writeFile(`.runs/record-review/${kind}.env`, content + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`Created ${kind} verification database ${name}.`);
  }
} finally {
  await client.end();
}
NODE
```

Unset inherited `DATABASE_URL`, `DIRECT_URL`, `RUN_DATABASE_TESTS`, `CRM_E2E_DATABASE_URL`, `CRM_E2E_BASE_URL`, `CRM_E2E_SERVER_MODE`, `WORKFLOW_LOCAL_DATA_DIR` and provider-pause flags before the commands below if the surrounding shell sets them. Existing process variables take precedence over Node's `--env-file` values. Unset libpq routing overrides; do not bypass a safety rejection. Validate the resolved environment before every migration or verification run.

## Application and database gates

Stop only servers owned by this verification session before database tests and scale measurements. Never reset a database used by another server or the human review app. Run gates sequentially; check the exit code and inspect the generated reports.

```sh
node --env-file=.env --env-file=.runs/record-review/db.env node_modules/.bin/tsx scripts/assert-local-database-url.ts
node --env-file=.env --env-file=.runs/record-review/db.env node_modules/.bin/prisma migrate deploy
node --env-file=.env --env-file=.runs/record-review/db.env node_modules/.bin/tsx prisma/seed.ts
node --env-file=.env --env-file=.runs/record-review/db.env node_modules/.bin/prisma migrate deploy
node --env-file=.env --env-file=.runs/record-review/db.env node_modules/.bin/tsx prisma/seed.ts
node --env-file=.env --env-file=.runs/record-review/db.env node_modules/.bin/bootstrap
yarn raw-docs:generate
yarn docs:generate-catalog
yarn openapi:generate
yarn typecheck
yarn lint
yarn i18n:audit
yarn vitest run tests/conventions
node --env-file=.env --env-file=.runs/record-review/db.env node_modules/.bin/vitest run --reporter=default --reporter=json --outputFile=.runs/record-review/application-results.json
```

Required database tests must actually run; a green result with them skipped is not acceptance. The full suite covers populated legacy upgrades and reconciliation, malformed legacy data, cross-table UUID collisions, exact decimals, protected tasks, identity matching, permissions, revocation, idempotency, cycles, asynchronous recovery and offline assistant orchestration. Inspect every skipped case separately. Five optional served-marketing HTTP cases were skipped in the prior run because their separate production-server URL was not supplied; they are not CRM/database skips.

Repeat migration deployment and seed twice on a separate loopback PostgreSQL 16 cluster, with its own database and volume. Also run the relevant record-engine and configurable-records-migration database subset there. Never attach a PostgreSQL 17 data directory to PostgreSQL 16. Follow the tracked [PostgreSQL 16 CI job](../../.github/workflows/test.yml) for the compatibility setup. To rehearse the legacy upgrade manually, restore a legacy database (all migrations before `20261004000000_configurable_records`) and run `prisma migrate deploy`; never run it against a database that already has generic record storage.

## Production-build browser matrix

Prepare the separate browser database. The checked-in [Playwright config](../../playwright.config.ts) launches the actual production application automatically with a dedicated workflow directory, paused hosted AI and the [loopback network guard](network-guard.mjs). It refuses a shared running server, uses one worker and has zero retries. Fixtures authenticate synthetic users, invoke production adapters/interactors and verify persistence rather than replacing CRM with browser mocks.

```sh
node --env-file=.env --env-file=.runs/record-review/browser.env node_modules/.bin/tsx scripts/assert-local-database-url.ts
node --env-file=.env --env-file=.runs/record-review/browser.env node_modules/.bin/prisma migrate deploy
node --env-file=.env --env-file=.runs/record-review/browser.env node_modules/.bin/tsx prisma/seed.ts
node --env-file=.env --env-file=.runs/record-review/browser.env node_modules/.bin/tsx prisma/seed.ts
node --env-file=.env --env-file=.runs/record-review/browser.env node_modules/.bin/bootstrap
node --env-file=.env --env-file=.runs/record-review/browser.env --input-type=module -e "import { spawnSync } from 'node:child_process'; const result = spawnSync('yarn', ['build'], { env: process.env, stdio: 'inherit' }); process.exit(result.status ?? 1);"
node --env-file=.env --env-file=.runs/record-review/browser.env node_modules/.bin/playwright test --list
CRM_E2E_RUN_ID=ssh-record-review-unique-run node --env-file=.env --env-file=.runs/record-review/browser.env node_modules/.bin/playwright test
```

The build command launches the new machine's installed Yarn CLI with the selected private environment. Equivalently run `yarn build` from an environment that has loaded those same values. Use a new `CRM_E2E_RUN_ID` for each run; inspect `.runs/e2e/<run-id>/results.json`, HTML report, screenshots and failure traces. The baseline inventory is 38 spec files and 70 authored journeys, each run in Chromium, Firefox, desktop WebKit and emulated iPhone WebKit: 280 profile combinations. Recount from the actual current report if the suite changes; do not force results to match an old number.

The [committed inventory](review/2026-10-03-summary.json) names every journey. Exercise the happy paths and their failure/recovery companions through the actual controls:

- The five starter types and new custom lists: create/edit, navigation, search, filters, grouping, boards, bulk selection, pagination, assignment, deletion and rename-safe routes.
- Every supported field type and calculation operator, lookup/rollup/snapshot/manual transitions, live/saved prices, duplicate line items, quantity/value/weighting, missing/zero/false, exact decimals and visible errors.
- Relationships from both ends, singular/many/self paths, channels shared across lists, identifier lookup, unlink/relink, explicit conversation links, new-thread drafts, attachments and synthetic local sending.
- Personal/shared views, detail layouts/pins, tables, drawer/full-page transitions, keyboard/focus, responsive overlays, assistant draft coexistence and theme/locale presentation.
- Unified widget creation/edit/preview, count/sum/average/minimum/maximum, relationship grain and attribution, filters, colors, activity details, templates, desktop movement and persisted layout.
- Independent administrators, schema delegates, assigned writers, workspace readers, restricted/no-access readers and another workspace. Distinguish separate-user permission tests from same-user multi-tab concurrency.
- Import/export, routines, webhook admission/delivery/retry, protected membership tasks, real authenticated MCP configuration and persisted UI results.
- Revoked access, stale versions/revisions, incompatible dependencies, restricted retained totals after archive/conversion, accepted writes followed by failed reads, interruption and staged atomic publication.

Do not use forced clicks, hidden controls, arbitrary retries, error suppression or weakened persistence assertions to turn a failure green. Find whether a failure comes from the product, a fixture that misses the real path, or a genuine platform constraint. Keep that distinction in the evidence.

## Manual UI over SSH

Use the separate synthetic review database created above if keeping an interactive app open. After a production build, prepare and start its guarded server:

```sh
node --env-file=.env --env-file=.runs/record-review/review.env node_modules/.bin/tsx scripts/assert-local-database-url.ts
node --env-file=.env --env-file=.runs/record-review/review.env node_modules/.bin/prisma migrate deploy
node --env-file=.env --env-file=.runs/record-review/review.env node_modules/.bin/tsx prisma/seed.ts
node --env-file=.env --env-file=.runs/record-review/review.env node_modules/.bin/bootstrap
node --env-file=.env --env-file=.runs/record-review/review.env node_modules/.bin/tsx tests/e2e/start-server.ts
```

Open `/en/auth/signin` at that origin and use the deliberately synthetic seed account defined in [the tracked seed fixture](../../core/config/synthetic-seed-user.ts). Sign in through the normal form; do not reuse workstation cookies or print a minted session token. The browser and server must share the new local authentication secret and origin. Test actors remain synthetic and external transport remains blocked.

Forward the chosen remote loopback port through SSH, for example:

```sh
ssh -N -L 4137:127.0.0.1:4137 <ssh-host>
```

Then open `http://127.0.0.1:4137/en/auth/signin` in the browser. A forwarded server port does not move the browser test runner: Playwright and its browser binaries can run headlessly on the SSH machine. Do not expose the server or database on a public interface. The interactive server uses port4137 and its own database/workflow directory; Playwright owns port4127 during its run.

## Scale and evidence

Use the separately created `crm_scale_...` database after migration and synthetic seed, with every verification server stopped. The checked-in [SQL scale tool](../../scripts/record-scale-local.ts) seeds/measures the cohort and the [interactor scale tool](../../scripts/record-scale-engine-local.ts) measures production interactors and staged consistency. Load the scale environment with Node `--env-file`, pass the exact generated database name through `--database`, run the SQL tool with `--mode seed` once and `--mode measure`, then the interactor tool with `--samples 30 --warmups 3 --staged`. Measure actual record/link/value counts; reused fixture totals differ from the fixed cohort. These are SQL/interactor measurements, not browser or hosted-capacity results.

The [current verification receipt](review/2026-10-04-summary.json) records the SSH-machine continuation after merging main with #196: tested commits and trees, runtime, PostgreSQL 17 and 16, build ID, every gate exit code, application, browser and PostgreSQL 16 counts, each failure with its cause and fix, every skip, reruns, scale measurements, the production-copy rehearsal aggregates and remaining limitations. The [earlier summary](review/2026-10-03-summary.json) pins the previous workstation run to functional commit `2753e0d46a3eaa43d4ecf3773bf57320bb59430d` and keeps the complete journey inventory. See the synthetic [Data model screenshot](review/data-model-2753e0d4.jpg) and [widget count preview](review/widget-preview-2753e0d4.jpg).

Leave new evidence with the tested commit/tree, runtime/PostgreSQL versions, database ownership names without credentials, build ID, commands/exit codes, discovered counts, all skip explanations, traces/screenshots, findings/fixes and unresolved limitations. Review the complete final diff and actual UI against established patterns. Passing scripted AI tests proves contracts/orchestration/persistence, not real-model reliability. Paid shipped-model benchmarking, live providers, external n8n consumers, production-data preflight, release/deployment and Docker architectures remain separately authorized gates. Do not merge or deploy this draft during continuation.
