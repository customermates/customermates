# templates_onboarding_automations_forms_and_booking

One migration for the template, onboarding, automation, notification, booking, public form and incoming webhook work.
It replaces six additive migrations that never reached production: `20261112140000_automation_rules_and_notifications`,
`20261112150000_calendar_write_booking`, `20261113120000_public_forms_and_incoming_webhooks`,
`20261113130000_onboarding_template_attribution`, `20261113131000_onboarding_measurement` and
`20261113140000_signup_campaign_team_size`. The end state is the six migrations' schema plus the
`BookingLink.personRelationshipId` column.

## Databases that applied the former migrations

A database that recorded the six in `_prisma_migrations` already has their schema. `prisma migrate deploy` treats this
file as pending, fails with `P3018` (`type "AutomationTriggerKind" already exists`) and then `P3009` until resolved.
Production, self-hosted installations of the previous release and the Demo environment (it resets on every build)
apply this file normally. For any other database, either recreate it (`prisma migrate reset`, or drop and deploy) or
move its ledger to this file after adding the one new column:

```sh
# 1. the six must all be recorded as finished (expect 6 rows)
psql "$DIRECT_URL" -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND migration_name IN ('20261112140000_automation_rules_and_notifications','20261112150000_calendar_write_booking','20261113120000_public_forms_and_incoming_webhooks','20261113130000_onboarding_template_attribution','20261113131000_onboarding_measurement','20261113140000_signup_campaign_team_size')"
# 2. add the column the six did not have
psql "$DIRECT_URL" -c 'ALTER TABLE "BookingLink" ADD COLUMN IF NOT EXISTS "personRelationshipId" TEXT'
# 3. forget the six
psql "$DIRECT_URL" -c "DELETE FROM _prisma_migrations WHERE migration_name IN ('20261112140000_automation_rules_and_notifications','20261112150000_calendar_write_booking','20261113120000_public_forms_and_incoming_webhooks','20261113130000_onboarding_template_attribution','20261113131000_onboarding_measurement','20261113140000_signup_campaign_team_size')"
# 4. record this migration as applied
DIRECT_URL="$DIRECT_URL" npx prisma migrate resolve --applied 20261116130000_templates_onboarding_automations_forms_and_booking
```

If a deployment already ran against such a database and failed, run
`prisma migrate resolve --rolled-back 20261116130000_templates_onboarding_automations_forms_and_booking` first, then steps 1 to 4.
