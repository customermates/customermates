import { getTranslations } from "next-intl/server";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";

const AI_BADGE_LOGOS = [
  { id: "claude", provider: "claude" },
  { id: "chatgpt", provider: "chatgpt" },
  { id: "gemini", provider: "gemini" },
  { id: "cursor", provider: "cursor" },
] as const;

export async function AiBadge({ className }: { className?: string }) {
  const t = await getTranslations();

  return (
    <p className={`homepage-hero-badge ${className ?? ""}`} data-ai-badge="">
      <span aria-hidden className="homepage-ai-stack">
        {AI_BADGE_LOGOS.map((logo) => (
          <span key={logo.id} data-ai-logo={logo.id}>
            <AiClientLogo className="size-3" provider={logo.provider} />
          </span>
        ))}
      </span>

      {t("SourceBadge.aiLabel")}
    </p>
  );
}
