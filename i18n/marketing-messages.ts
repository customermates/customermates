export const MARKETING_NAMESPACES = [
  "AcquisitionConsent",
  "AgplGithubBadge",
  "BrowserFrame",
  "Common",
  "ComparePage",
  "ContactPage",
  "DocsPage",
  "DocsSidebar",
  "ErrorCard",
  "FAQSection",
  "Footer",
  "HomepagePricing",
  "HomepageStatsRow",
  "Loading",
  "NavigationBar",
  "NotFoundPage",
  "OnboardingWizard",
  "StructuredData",
  "UserAvatar",
] as const;

const MARKETING_NAMESPACE_SET: ReadonlySet<string> = new Set(MARKETING_NAMESPACES);

export function pickMarketingMessages<Messages extends Record<string, unknown>>(messages: Messages): Partial<Messages> {
  const picked: Record<string, unknown> = {};
  for (const namespace of Object.keys(messages))
    if (MARKETING_NAMESPACE_SET.has(namespace)) picked[namespace] = messages[namespace];

  return picked as Partial<Messages>;
}
