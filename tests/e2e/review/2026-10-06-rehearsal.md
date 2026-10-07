# PR #203 production-copy rehearsal and local UI receipt — interim checkpoint at 4223d7deb

Interim checkpoint: the final source of #203 will change because the owner is editing the CRM migration; this receipt describes 4223d7deb only. Aggregate, redacted evidence only. The accepted migration reconciliation and the local owner/administrator UI comparisons are recorded below with their executed source identities, the legacy failure and unavailable samples. The final functional source proof, the complete automated verification and the copy destruction are recorded at the end; the companion [summary](2026-10-06-summary.json) holds the exact synthetic gate counts.

The SQL rehearsal executed commit `410115417826ad45aab3dea1a66dc3e8d66daf9d`. The single migration `20261004000000_configurable_records` has public SQL SHA-256 `bc553c17285d59c22d3289e79ce32cd2446f44da841da7ae3bb4b653a7676309`, verified byte-identical, together with the Prisma schema, at the executed final functional source `4223d7deb6fb7b1030ad5a5762d4a35bf3a6eb7c`. The local migrated UI was replayed on fresh baseline clones at commit `4223d7deb6fb7b1030ad5a5762d4a35bf3a6eb7c`, tree `09e1e0313fadd6e2adb52098747fa9f5a3284549`, copy production build `3RIx41n_ae7jIGTWiUyXM`; its ledger-matched legacy comparison executed `89f336f1978401d945ba7ba75141d2e435208a3e`, build `5TpPBbvKOIRe49U58AYLf`. The final UI replay and the copy deploy that preceded it ran on a 16 vCPU / 64 GB VM after a resize; the SQL rehearsal timings below were measured earlier on the 8 vCPU host and are not re-measured.

The owner imported into an isolated, owned, loopback PostgreSQL 17 pgvector destination. The agent held no production credential and made no production mutation. A sanitized baseline was frozen; separate template clones were used for migration, interruption/recovery and local UI work.

| Import, isolation and source check | Recorded result |
| --- | --- |
| Sanitization | 11/11 aggregate checks returned zero usable entries; credentials, sessions, verification/API/OAuth/billing values neutralized; provider accounts and webhooks disabled |
| Loopback-only guard | 15/15 synthetic checks passed |
| PostgreSQL server | 17.8 (Debian 17.8-1.pgdg12+1) |
| Imported migration ledger | 117 entries, zero unresolved failed migrations |
| Legacy application match | All 49 retained migration names and byte checksums matched the recorded legacy commit; the remaining 68 ledger entries predate the repository's initial squash and their SQL is absent from its full history |
| Legacy schema | Exact 72-table shape checked, with no silent schema skips |

Independent expectations were frozen before the accepted fresh migration. Plain legacy SQL covered starter records, typed values, exact decimal arithmetic and null/zero distinctions, links, assignments, identities/aliases, line items and quantities, independently calculated deal and weighted totals, thread associations, and protected/retained data. Migration conversion or reconciliation helpers were not used as the oracle.

The initial independent thread-identifier oracle omitted the public trimmed-value fallback for rejected nonempty channel identifiers. The original expectation and failed receipt were retained. Before the fresh accepted deploy, the independent oracle was corrected from the public normalization contract: 22 synthetic vectors, 14 original mismatches and zero corrected mismatches. This required no migration-code change; the initial failure is preserved rather than presented as accepted migration evidence.

The five individual starter-type counts below were also exported later through read-only aggregate SQL against the untouched expectations clone. That later export does not replace or relabel the private independent expectations frozen before migration.

| Reconciliation scope | Count |
| --- | ---: |
| Workspaces | 145 |
| Five starter record types, excluding line items | 8,131 |
| Contact starter records | 3,871 |
| Organization starter records | 2,279 |
| Deal starter records | 546 |
| Service starter records | 244 |
| Task starter records | 1,191 |
| Line-item records | 433 |
| All migrated records, including line items | 8,564 |
| Typed values | 64,243 |
| Links | 5,703 |
| Assignments | 2,836 |
| Identities | 5,233 |
| Retained tables | 50 |
| Independent expectation groups | 3,156 |
| Raw legacy table groups checked after interruption | 2,916 across 72 tables |
| Additional post-migration checks per reconciliation | 8 |

All 433 copied line items used live prices; there were zero saved-price copy samples. Saved-price scenarios have separate synthetic coverage, and no saved-price production-copy UI coverage is claimed.

| Typed-value coverage | Count |
| --- | ---: |
| currency | 2,340 |
| date | 3,693 |
| email | 32 |
| number | 979 |
| phone | 407 |
| richText | 8,131 |
| select | 23,693 |
| text | 19,408 |
| url | 5,560 |

First deploy, second deploy and recovery each reconciled all 3,156 independent groups with zero unexplained differences. Target-schema column differences were zero. The second deploy had no pending migrations and left raw table fingerprints and the migration ledger unchanged. Retained-state comparisons passed.

The following durations are the exact reported values in the approved redacted timing JSON, in seconds at six decimal places. That JSON derives from the previously approved aggregate table; no finer precision is claimed.

| Operation | Reported seconds |
| --- | ---: |
| First migration deploy | 31.482374 |
| First reconciliation | 174.552239 |
| Second deploy, no pending migrations | 1.706404 |
| Second reconciliation | 170.145349 |
| Interrupted deploy, expected command failure | 9.489063 |
| Active-execution termination witness | 8.065212 |
| Legacy-intact reconciliation | 88.732867 |
| Resolve interrupted attempt as rolled back | 1.776941 |
| Recovery deploy | 23.281952 |
| Recovery reconciliation | 174.648849 |

The interruption terminated an actively executing Prisma migration batch, rather than a lock-wait setup. At the termination witness, six core legacy tables were locked and 56 new relations remained uncommitted. The interrupted command failed as expected; the legacy schema and all 2,916 raw groups across 72 tables remained intact with zero differences. Resolving the unfinished attempt as rolled back and deploying again succeeded, followed by zero reconciliation differences.

All original 117 ledger entries remained exact. First successful deploy had 118 entries; the second deploy changed none. Recovery had 119 entries, including one rolled-back attempt and one successful application in addition to the original ledger.

The README read-only inventory predicted exactly four webhook configuration changes and zero changes among 27 routine configurations, including zero scheduled-routine changes. Missing and unexpected predictions were both zero, and configuration counts were retained. All four webhooks were already disabled by sanitization: the comparison verifies configuration changes, rather than attributing their disabled state to migration. The scheduled-routine configuration-cleanup case has separate synthetic coverage.

The local comparisons used actual UI controls in Firefox, passwordless local sessions, loopback-only servers and blocked external networking, with provider/model work paused. No password fallback, screenshots, traces, videos, DOM dumps or raw console logs were used.

| Account and application | Passed | Failed | Not applicable |
| --- | ---: | ---: | ---: |
| Owner, legacy | 27 | 1 | 5 |
| Owner, migrated | 32 | 0 | 1 |
| Largest-workspace administrator, legacy | 28 | 0 | 5 |
| Largest-workspace administrator, migrated | 31 | 0 | 2 |

There were 33 distinct checks per account/application. The fresh main execution took 488.964411369 seconds and recorded 132 checks: 113 passes, 1 legacy failure and 18 not applicable. The supplementary template/automation execution took 26.3536256 seconds and passed all 10 checks, including repeated session/browser checks. After deduplicating those checks, the combined result is **132 distinct checks: 118 passed, 1 legacy failure and 13 not applicable**.

| Happy-path coverage | Owner, migrated | Largest-workspace administrator, migrated | Legacy comparison and limits |
| --- | --- | --- | --- |
| All five starter lists: totals, search, both sort directions, record opening and field values | Pass, 20 checks | Pass, 20 checks | Both legacy accounts passed all 20 checks |
| Populated deal stages | Not applicable | Not applicable | Neither selected workspace had a populated stage sample; all four lanes mark this unavailable |
| Deal line-item quantities/live prices and independent totals/weighted values | Pass | Pass | Both legacy accounts passed; zero saved-price copy samples |
| Contact/organization/deal relationships from both ends | Pass | Pass | Both legacy accounts passed |
| Channel identifiers | Pass | Pass | Both legacy accounts passed |
| Linked inbox threads | Pass | Not applicable | Owner legacy passed; largest workspace had no linked-inbox sample in either lane |
| Configure inventory and adding/using a custom field | Pass | Pass | Two generic controls lack a legacy counterpart; legacy custom-field values were checked through record fields and SQL reconciliation |
| Creating a template dashboard widget with correct count | Pass | Pass | Both legacy accounts passed; migrated template creation was verified by the supplementary actual-UI path |
| Webhooks | Pass, empty inventory | Pass, populated disabled inventory | Owner legacy had no populated sample; administrator legacy passed populated disabled-state checks |
| Event-triggered routines | Pass, empty inventory | Pass, empty inventory | No populated event-routine sample exists in either selected workspace; legacy lanes mark unavailable |
| Browser errors/local request failures/crashes | Pass, all zero | Pass, all zero | Administrator legacy passed; owner legacy retained one browser-error failure |

The owner's webhook inventory and both migrated event-routine inventories matched independent expectations as empty inventories. These inventory passes provide no populated disabled-state sample. The largest workspace's populated webhook inventory showed every expected webhook disabled; sanitization had already disabled those configurations. Separate synthetic coverage supplies populated stage, saved-price and automation scenarios.

The owner legacy app emitted one legacy-only embedded-image `img-src` CSP console error. It remains a failed legacy browser check. Both migrated accounts and the administrator legacy account had zero page errors, console errors, failed local requests and crashes. The original failure is retained; no browser-noise filter or assertion was widened to produce these results.

**Final-source proof:** the recorded migration checksum and Prisma schema are unchanged between the SQL-executed source and final functional source `4223d7deb6fb7b1030ad5a5762d4a35bf3a6eb7c`. Copied UI was freshly executed on that exact source and tree after a fresh deploy to reset baseline clones (19.280 s on the resized host); its production build is separately identified above. This compares tracked source bytes, not compiled bundles from differently configured servers. Earlier UI replays at prior heads are not relabeled.

**Copy destruction: held.** At the owner's direction the sanitized loopback copy, its frozen baseline, template clones and private expectations are retained on the VM (private 0700 storage, loopback-only, blocked external networking) because the CRM migration is being edited inside #203 and will be re-rehearsed. The copy servers and browser sessions used for this replay are stopped. Destruction will be recorded when it is actually performed; it is not claimed here.

Remaining human steps are the owner's separate deep exploratory UI session, Code Owner review, PR merge and release-window selection. The PR remains a draft. The synthetic four-browser matrix at the same source passed 307/312; its three WebKit engine crashes (a Playwright WebKit compositor bug triggered by overlay blur keyframes) and two fixed harness races are classified in the [summary](2026-10-06-summary.json).

This receipt contains aggregate counts and code-source identities only, with no copied records, customer identifiers, account addresses, credentials, private data fingerprints, database URLs or screenshots.
