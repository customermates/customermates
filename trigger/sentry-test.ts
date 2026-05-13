import { task } from "@trigger.dev/sdk/v3";

export const sentryTestFailure = task({
  id: "sentry-test-failure",
  retry: { maxAttempts: 1 },
  maxDuration: 10,
  run: (payload: { reason?: string }) => {
    throw new Error(`Intentional sentry-test failure: ${payload.reason ?? "no reason given"}`);
  },
});
