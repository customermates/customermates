-- Restore a hosted-AI allowance for Enterprise workspaces that never had one configured.
--
-- `PLAN_CATALOG.enterprise.entitlements.hostedAiCreditsPerActiveUser` is the string "contract", not a
-- number, so an Enterprise workspace draws its allowance solely from this column. The column has been
-- nullable with no default since 20260817120000_agent_assistant and nothing has ever written it, so in
-- practice every Enterprise row still holds NULL.
--
-- Until 20260828120000_hosted_ai_operator_control, `paidPlanAllowance` closed that gap with
-- `contracted ?? lowestPlanHostedAiCreditsPerActiveUser()`, which resolved to the Starter allowance of
-- 200. Those workspaces were therefore already running on 200 credits per active user. That migration
-- removed the fallback so the policy fails closed, which turns every unconfigured Enterprise row into
-- `enterprise_allowance_missing` and surfaces to the user as `configuration_unavailable`: "The hosted
-- Assistant is temporarily unavailable."
--
-- 200 is chosen because it is exactly what these workspaces were already receiving, so this restores the
-- prior runtime behaviour rather than granting a silent upgrade. It is deliberately a frozen historical
-- constant and not a live link to the Starter allowance: a later change to Starter pricing must not
-- retroactively reprice Enterprise contracts. Real contracted rates are set per workspace afterwards
-- through the operator console, which writes this same column.
--
-- Every status is backfilled, not only `active`. A cancelled or past-due Enterprise row is already blocked
-- earlier by `subscription_unavailable`, so the value is inert today, but leaving it NULL would silently
-- re-block the workspace the moment billing recovers.
--
-- Idempotent: rows that already carry a value do not match, so a re-run is a no-op. 200 satisfies the
-- "Subscription_enterprise_agent_credits_valid" CHECK (NULL, or BETWEEN 1 AND 1000000).
UPDATE "Subscription"
SET "enterpriseAgentCreditsPerUser" = 200
WHERE "plan" = 'enterprise'
  AND "enterpriseAgentCreditsPerUser" IS NULL;
