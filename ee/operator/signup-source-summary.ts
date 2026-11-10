type SignupSourceFields = {
  landingPath: string;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
};

export function signupSourceSummary(source: SignupSourceFields): string {
  const campaign = [source.utmSource, source.utmMedium].filter(Boolean).join(" / ");
  return [campaign || source.referrerHost, source.landingPath].filter(Boolean).join(" · ");
}
