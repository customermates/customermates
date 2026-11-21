import { Github, Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { AppLink } from "@/components/shared/app-link";
import { contentLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";

import { GITHUB_REPOSITORY_URL } from "./github-repository";
import { getGithubStarCount } from "./github-stars";

type Props = {
  className?: string;
};

export async function SourceBadge({ className }: Props) {
  const [t, starCount, locale] = await Promise.all([getTranslations(), getGithubStarCount(), getLocale()]);
  const formattingTag = formattingTagFor(contentLocaleOrDefault(locale));

  return (
    <div className={`homepage-hero-badge mb-[24px] ${className ?? ""}`} data-source-badge="">
      <AppLink
        external
        appearance="unstyled"
        className="inline-flex items-center gap-2 transition-colors hover:text-foreground focus-visible:text-foreground"
        href={GITHUB_REPOSITORY_URL}
      >
        <span aria-hidden className="homepage-hero-badge-icon">
          <Github className="size-3" />
        </span>

        <span>{t("SourceBadge.label")}</span>
      </AppLink>

      {starCount !== null && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Star aria-hidden className="size-3 fill-current text-yellow-400" />

          <span>{starCount.toLocaleString(formattingTag)}</span>
        </span>
      )}
    </div>
  );
}
