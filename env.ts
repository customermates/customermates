export const env = {
  DATABASE_URL: process.env.DATABASE_URL as string,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET as string,
  BASE_URL: process.env.BASE_URL ?? "http://localhost:4000",

  NODE_ENV: (process.env.NODE_ENV as "development" | "test" | "production" | undefined) ?? "development",
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  NEXT_RUNTIME: process.env.NEXT_RUNTIME as "nodejs" | "edge" | undefined,
  CI: process.env.CI,

  DEMO_MODE: process.env.DEMO_MODE === "true",
  CLOUD_HOSTED: process.env.CLOUD_HOSTED === "true",

  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_OPERATOR_EMAIL: process.env.RESEND_OPERATOR_EMAIL as string,

  WORKFLOW_TARGET_WORLD: process.env.WORKFLOW_TARGET_WORLD,
  CRON_SECRET: process.env.CRON_SECRET,

  SENTRY_ORG: process.env.SENTRY_ORG,
  SENTRY_PROJECT: process.env.SENTRY_PROJECT,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
  AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,

  LEMONSQUEEZY_API_KEY: process.env.LEMONSQUEEZY_API_KEY,
  LEMONSQUEEZY_WEBHOOK_SECRET: process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
  LEMONSQUEEZY_STORE_ID: process.env.LEMONSQUEEZY_STORE_ID,
  LEMONSQUEEZY_VARIANT_ID_MONTHLY: process.env.LEMONSQUEEZY_VARIANT_ID_MONTHLY,
  LEMONSQUEEZY_VARIANT_ID_YEARLY: process.env.LEMONSQUEEZY_VARIANT_ID_YEARLY,

  DEMO_USER_EMAIL: process.env.DEMO_USER_EMAIL,
  DEMO_USER_PASSWORD: process.env.DEMO_USER_PASSWORD,

  UNIPILE_DSN: process.env.UNIPILE_DSN,
  UNIPILE_API_KEY: process.env.UNIPILE_API_KEY,
  UNIPILE_WEBHOOK_SECRET: process.env.UNIPILE_WEBHOOK_SECRET,

  // Agent chat — the model provider is selected from whichever key is set
  // (Anthropic is preferred when both are present). Model ids are overridable.
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,

  // Sandboxed code execution (run_code tool). Disabled unless explicitly enabled AND
  // an executor is configured. Production substrate is AWS Lambda MicroVMs (see
  // infra/code-exec) — a fresh, tenant-isolated MicroVM per run, terminated right
  // after, reaching CRM data only via the read-only broker in DATA mode.
  SANDBOX_CODE_EXEC_ENABLED: process.env.SANDBOX_CODE_EXEC_ENABLED === "true",
  // MicroVMs substrate (production). All four required together — see the
  // `MicrovmImageArnOutput`/`DataNetworkConnectorArnOutput`/
  // `NetNetworkConnectorArnOutput` stack outputs from infra/code-exec. AWS
  // credentials come from the standard SDK provider chain (env vars / IAM role),
  // not from an app-config var.
  SANDBOX_MICROVM_REGION: process.env.SANDBOX_MICROVM_REGION,
  SANDBOX_MICROVM_IMAGE_ARN: process.env.SANDBOX_MICROVM_IMAGE_ARN,
  SANDBOX_MICROVM_DATA_CONNECTOR_ARN: process.env.SANDBOX_MICROVM_DATA_CONNECTOR_ARN,
  SANDBOX_MICROVM_NET_CONNECTOR_ARN: process.env.SANDBOX_MICROVM_NET_CONNECTOR_ARN,
  // Local/dev substrate: a plain HTTP process (see sandbox/README.md), used only
  // when the MicroVM vars above aren't set. A single local/dev executor can serve
  // NET-mode requests itself (it reads `mode` from the request body); the optional
  // _NET var lets you point NET-mode runs at a separate local process instead.
  SANDBOX_EXECUTOR_URL: process.env.SANDBOX_EXECUTOR_URL,
  SANDBOX_EXECUTOR_URL_NET: process.env.SANDBOX_EXECUTOR_URL_NET,
  // Public URL the sandbox uses to call the read-only data broker back. Defaults
  // to BASE_URL; override when the broker is reached over a private path.
  SANDBOX_BROKER_URL: process.env.SANDBOX_BROKER_URL,
  // HMAC secret for short-lived run-scoped data tokens. Must be set in prod;
  // falls back to BETTER_AUTH_SECRET in dev so the feature works out of the box.
  SANDBOX_TOKEN_SECRET: process.env.SANDBOX_TOKEN_SECRET ?? process.env.BETTER_AUTH_SECRET,
};
