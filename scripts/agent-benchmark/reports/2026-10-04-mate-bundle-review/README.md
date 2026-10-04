# Mate bundle: review packet at 93123c8c0

Product head `93123c8c0` replaces the agent-loop website import with a per-page durable pipeline and stores AI credits only as exact microcents. Free local verification passed. Live provider acceptance (complete initial import, chat citations, hosted retrieval suite) has **not** been re-run on this head, so this packet does not claim merge readiness.

## What changed since `6866e56d5`

- **Credits.** The consolidated migration adds BIGINT microcent columns, backfills legacy credits × 1,000,000, rebuilds the CHECK constraints and drops the whole-credit columns in one step. No synchronization trigger and no application fallback remain.
- **Website import.** `workflows/crawl-wiki-website.ts` plans once, writes one page per durable step and settles. A rejected or failing page is skipped with a recorded reason and never stops the import. A redelivered page step resumes its topic; page creation and the topic's `created` status commit in one transaction. No chat conversation is created.
- **Metering.** Every planning, drafting, repair and review call reserves its worst case and settles on the Gateway receipt or an estimate. A call that fails without usage is charged its worst case; a request the Gateway rejects before generation is released.
- **Browser-testing fixes.** An unreachable `robots.txt` reports the site as unavailable instead of blocked; the Knowledge Base page explains the failure reason; read-only members do not see a retry alert; page-creation errors highlight their field; topic claims use Prisma instead of raw SQL.

## Evidence

| Check | Result |
| --- | --- |
| Typecheck, `lint --max-warnings=0` (Node 24.18.0) | Passed at `93123c8c0` |
| Full Vitest with database suites (PG17 + pgvector, `DATABASE_URL` and `DIRECT_URL` on an owned database) | 10,262 passed; 5 load timeouts at load average ~23, each passing alone |
| Migration matrix | Fresh migrate and two seeds passed on PG16 without pgvector and PG17 with it; populated-upgrade and failure-recovery cases are in the database suite |
| Sanitized production copy (snapshot 2026-10-03) | Restore 26 s, migration 2 s; every microcent sum equals legacy × 1,000,000; 161 users and 150 completed onboardings preserved; 4 custom roles gained Knowledge Base permissions; no legacy columns or PL/pgSQL functions remain |
| Production build | Passed |
| Built-app browser journeys | Registration and onboarding; invalid, unreachable and duplicate import submissions; retry; continuing onboarding after a failed import; Knowledge Base create, edit, Reset, Save, reload, search, procedure validation and delete with audit entries; unsaved-changes guard; read-only role; tenant isolation; 390 px layout |
| Independent review | No blockers; its three should-fix findings were fixed in `93123c8c0` |
| Review threads | All 12 resolved and rechecked against the new code |

## Not verified on this head

- A complete live ainovi.de initial import, chat with Knowledge Base citations and the Dashboard setup starter.
- The hosted retrieval contract suite. The last run (before this continuation) passed 28/30; the task/permissions and CRM families still fail strictly. Golden fixtures, assertions and retrieval budgets are unchanged.
- Paid spend in this continuation: US$0.

## Known limitations

- During the deployment build after the migration commits, the previous deployment cannot read the AI ledger tables, so hosted chat and routines can fail for those minutes. The migration sets no `lock_timeout`.
- Preview databases must be reset because the bundle migration was rewritten in place.
- A hosted-AI refusal that is not about credits (blocked subscription or platform cap) is reported to the user as missing credits.

Complete per-file review: [review-matrix.csv](./review-matrix.csv).
