# Draft sends, the activity log permission, rounded money calculations and membership tasks

`migration.sql` has four parts: (1) it creates the `MessagingDraftSend` table that records each email draft send,
(2) it renames the `auditLog` permission resource to `activityLog`, in `RolePermission` and in the role snapshots of
role events and role save receipts, (3) it rounds the money calculations of upgraded workspaces and (4) it removes the
membership authorization tasks. This file describes parts 3 and 4, the parts that read or rewrite workspace data.

## Rounding the money calculations of upgraded workspaces

Part 3 stores the calculated money values that `20261010000000_dynamic_record_model` materialised with
exact decimals as the record engine rounds them: line unit prices and amounts, deal values and weighted values of
the upgraded workspaces whose record model is still the one the upgrade wrote. The comment above part 3
lists what it recomputes and what it leaves alone. It is an ordinary Prisma migration, applied by
`prisma migrate deploy` in the production build and when the self-hosted image starts, and PostgreSQL runs the whole file as one
implicit transaction.

### Locks

The migration tries the record engine's advisory lock of each candidate workspace without waiting for it. A
workspace whose lock a running application transaction holds at that moment is skipped: it keeps the exact values of
the upgrade until its records are next recalculated. The locks it takes are held until it commits, so record writes
in those workspaces wait for it and fail after their usual 5 seconds if it runs longer. Any other lock it needs, such
as a row the application is writing, it waits for at most 5 seconds (`lock_timeout`) and then fails. Parts 1 and 2
run before these settings and wait for their locks without a timeout, as any migration does.

## Removing the membership authorization tasks

Until this release a member who asked to join a workspace got a protected task ("User Pending Authorization (email)")
in the list that the record model's `membershipAuthorization` capability named, and that capability made the list
impossible to delete. Pending members are listed and approved in Settings > Members, so part 4 removes both:

- Every record with `"protectedKind" = 'membershipAuthorization'` is deleted for good, as the engine deletes a record:
  its values, value dependencies, links, assignments, channel and conversation links go with it (foreign keys), and
  part 4 also deletes the value dependencies that name it as a source and channel identities that no other record
  holds. Its record events stay, as they do for any deleted record. The members are not changed.
- The capability leaves every stored record model and configuration the application reads: each revision snapshot,
  the configuration operations recorded in revision changes, the requests of record operations and their staged
  models. The models are edited in place, without a new revision: the capability changes no list, field, relationship
  or value.
- The `"protectedKind"` column of `"CrmRecord"` is dropped. `"systemData"` stays; trash staging and the record scale
  tools use it.

A record whose calculation read a removed task, which needs a user to have linked one, keeps its stored value until
its next recalculation. Part 4 writes no record events.

Part 4 locks `CrmRecord` against writes and finally drops the column, which takes an exclusive lock on `CrmRecord`;
both wait at most the 5 seconds of part 3's `lock_timeout`. The previous deployment still selects the dropped column,
so its record reads fail from the moment the migration commits until the new deployment serves; deploy when a short
interruption is acceptable.

## Recovery

A lock timeout, an error or an interrupted connection rolls the whole migration back, all four parts; no table,
permission, value or record is changed. Prisma then
records the migration as failed and refuses every further deployment with `P3009` until it is resolved:

1. Read the error in the deployment log.
2. `prisma migrate resolve --rolled-back 20261019180000_draft_sends_activity_log_money_rounding_and_membership_tasks`
3. `prisma migrate deploy`

On a self-hosted instance the app container stops at the failed migration. Run the second step as
`docker compose run --rm app npx prisma migrate resolve --rolled-back 20261019180000_draft_sends_activity_log_money_rounding_and_membership_tasks`,
then `docker compose up -d` deploys it again. A second run is safe: the rolled-back run left nothing behind, part 3
rewrites only values that still differ from the rounded ones, and part 4 finds only what is still protected.
