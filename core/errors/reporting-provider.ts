export function usesVercelErrorReporting(): boolean {
  const provider = process.env.NEXT_PUBLIC_ERROR_REPORTING_PROVIDER;
  if (provider && provider !== "off" && provider !== "vercel")
    throw new Error("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER must be off or vercel");
  return provider !== "off";
}

export function errorReportingEnabled(): boolean {
  return usesVercelErrorReporting();
}
