export function usesVercelErrorReporting(): boolean {
  const provider = process.env.NEXT_PUBLIC_ERROR_REPORTING_PROVIDER;
  if (provider && provider !== "sentry" && provider !== "vercel")
    throw new Error("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER must be sentry or vercel");
  return provider === "vercel";
}

export function errorReportingDsn(): string | undefined {
  return usesVercelErrorReporting() ? "https://vercel@errors.invalid/1" : process.env.NEXT_PUBLIC_SENTRY_DSN;
}

export function errorReportingEnabled(): boolean {
  return Boolean(errorReportingDsn());
}
