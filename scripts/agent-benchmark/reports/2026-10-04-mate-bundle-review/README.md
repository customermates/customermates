# Mate bundle: review packet at 861ea1a56

Product head `861ea1a56` replaces the agent-loop website import with a per-page durable pipeline, stores AI credits only as exact microcents, and fixes the defects found in live testing. Free local verification passed at `93123c8c0`; the later commits have focused tests and the live checks below. This packet does not claim merge readiness while the hosted retrieval suite fails.

## What changed since `6866e56d5`

- **Credits.** The consolidated migration adds BIGINT microcent columns, backfills legacy credits × 1,000,000, rebuilds the CHECK constraints and drops the whole-credit columns in one step. No synchronization trigger and no application fallback remain.
- **Website import.** `workflows/crawl-wiki-website.ts` plans once, writes one page per durable step and settles. A rejected or failing page is skipped with a recorded reason and never stops the import. Workflow turbo mode can run a step body twice at once, so the first stored plan wins and one delivery claims each topic while a duplicate waits; page creation and the topic's `created` status commit in one transaction. No chat conversation is created.
- **Metering.** Every planning, drafting, repair and review call reserves its worst case and settles on the Gateway receipt or an estimate. A call that fails without usage is charged its worst case; a request the Gateway rejects before generation is released. Chat turns now read provider receipts through the runtime's retry-exhaustion wrapper, so a 429 whose receipt proves no provider attempt succeeded no longer settles at the whole remaining reservation.
- **Citations.** The Knowledge Base context gives each page a ready-to-copy `[title](/wiki?page=id)` link instead of separate id, title and url fields.
- **Browser-testing fixes.** An unreachable `robots.txt` reports the site as unavailable; the Knowledge Base page explains the failure reason; read-only members do not see a retry alert; page-creation errors highlight their field; topic claims use Prisma instead of raw SQL.
- **Docs.** The record list ids section points permission questions to the role editor instead of repeating it.

## Evidence

| Check | Result |
| --- | --- |
| Typecheck, `lint --max-warnings=0` (Node 24.18.0) | Passed at `93123c8c0`; later commits typecheck and lint clean |
| Full Vitest with database suites (PG17 + pgvector, both URLs on an owned database) | 10,262 passed at `93123c8c0`; timing tests that fail only under load averages of 20–37 pass alone |
| Migration matrix | Fresh migrate and two seeds on PG16 without pgvector and PG17 with it; populated-upgrade and failure-recovery cases in the database suite |
| Sanitized production copy (snapshot 2026-10-03) | Restore 26 s, migration 2 s; every microcent sum equals legacy × 1,000,000; 161 users and 150 completed onboardings preserved; 4 custom roles gained Knowledge Base permissions; no legacy columns or PL/pgSQL functions |
| Production build | Passed at `b8273aa16` |
| Live ainovi.de import 1 (`93123c8c0`) | Completed, 9 of 11 pages, US$0.87; exposed the duplicate-step defect (the Operating Guide was closed early) |
| Live ainovi.de import 2 (`f1a54ef4f`) | Completed, 10 of 10 pages including all foundations and the Operating Guide (pinned guide, links all pages, internal rules as gaps), US$0.45 |
| Live chat with Knowledge Base citations | Before the citation change 1 of 4 answers showed `[[internal reference]]`; after it, 3 of 3 completed answers cite `[title](/wiki?page=id)`. Three further turns failed with Vertex HTTP 429 at capacity |
| Live Dashboard setup starter | Read the Knowledge Base, made no writes, created no records |
| Hosted retrieval suite | 28/30 after the docs fix: the task/permission family fails on the ambiguous German "Wie läuft der Import ab?" (passed the previous run), and the CRM family hit the 240 s test timeout under load (passed its strict checks when run alone) |
| Built-app browser journeys | Registration, onboarding, invalid, unreachable and duplicate imports, retry, continuing onboarding during and after imports, Knowledge Base create, edit, Reset, Save, reload, search, procedure validation and delete, unsaved-changes guard, read-only role, tenant isolation, 390 px layout |
| Independent review | No blockers; findings fixed |
| Review threads | All 12 resolved and rechecked |
| Paid spend in this continuation | About US$1.90 of the US$10 budget |

## Known limitations

- The hosted retrieval suite is not 30/30; see the evidence row.
- During the deployment build after the migration commits, the previous deployment cannot read the AI ledger tables, so hosted chat and routines can fail for those minutes. The migration sets no `lock_timeout`.
- Preview databases must be reset because the bundle migration was rewritten in place.
- A hosted-AI refusal that is not about credits is reported to the user as missing credits.
- Chat turns allow no SDK retry for a 429 at capacity, so the user sees a retry message.
- The crawler reads the apex and `www` homepage as two pages.

Complete per-file review: [review-matrix.csv](./review-matrix.csv).
