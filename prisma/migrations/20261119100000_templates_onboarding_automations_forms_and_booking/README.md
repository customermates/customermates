# templates_onboarding_automations_forms_and_booking

One migration for the template, onboarding, automation, notification, booking, public form and incoming webhook work.
It replaces six additive migrations that never reached production: `20261112140000_automation_rules_and_notifications`,
`20261112150000_calendar_write_booking`, `20261113120000_public_forms_and_incoming_webhooks`,
`20261113130000_onboarding_template_attribution`, `20261113131000_onboarding_measurement` and
`20261113140000_signup_campaign_team_size`. The end state is the six migrations' schema plus the
`BookingLink.personRelationshipId` column, the `NotificationKind` enum without the values `assigned` and
`formSubmission`, which nothing ever wrote, the agent tables `AgentProviderKey`, `AgentRunner` and `AgentJob` with
their enums, the `NotificationPause` table and the `AgentUsagePurpose` value `automationCompose`.

## Databases that applied the former migrations

A database that recorded the six in `_prisma_migrations` already has their schema. `prisma migrate deploy` treats this
file as pending, fails with `P3018` (`type "AutomationTriggerKind" already exists`) and then `P3009` until resolved.
Production, self-hosted installations of the previous release and the Demo environment (it resets on every build)
apply this file normally.

Any other database, such as the shared Vercel preview database or a development database of this branch, has to be
recreated: `prisma migrate reset`, or drop it and run `prisma migrate deploy`. Its ledger cannot be moved to this file,
because this file also creates objects the six never had (the agent tables, `NotificationPause`, the
`BookingLink.personRelationshipId` column and the `automationCompose` value) and defines `NotificationKind` with three
values instead of five.
