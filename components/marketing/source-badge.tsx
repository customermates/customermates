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
    <div
      className={`mb-[24px] inline-flex items-center gap-2 rounded-full border border-border bg-card px-[11px] py-[5px] text-xs text-foreground ${className ?? ""}`}
    >
      <AppLink
        external
        appearance="unstyled"
        className="inline-flex items-center gap-2 text-foreground no-underline transition-colors hover:text-muted-foreground focus-visible:text-muted-foreground"
        href={GITHUB_REPOSITORY_URL}
      >
        <Github aria-hidden className="size-3.5" />

        <span className="font-semibold">{t("SourceBadge.label")}</span>
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
