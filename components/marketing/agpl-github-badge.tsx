import { Github, Star } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AppLink } from "@/components/shared/app-link";

type Props = {
  className?: string;
};

async function getStarCount(): Promise<number | null> {
  try {
    const res = await fetch("https://api.github.com/repos/customermates/customermates", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

export async function AgplGithubBadge({ className }: Props) {
  const t = await getTranslations("AgplGithubBadge");
  const label = t("label");
  const starCount = await getStarCount();

  return (
    <div
      className={`mb-[18px] inline-flex items-center gap-2 rounded-full border border-border bg-card px-[11px] py-[5px] text-xs text-foreground ${className ?? ""}`}
    >
      <AppLink
        external
        className="inline-flex items-center gap-2 text-foreground hover:text-primary hover:no-underline"
        href="https://github.com/customermates/customermates"
      >
        <Github aria-hidden className="size-3.5" />

        <span className="font-semibold">{label}</span>
      </AppLink>

      {starCount !== null && (
        <span className="flex items-center gap-1">
          <Star aria-hidden className="size-3 fill-current text-yellow-400" />

          <span>{starCount.toLocaleString("en-US")}</span>
        </span>
      )}
    </div>
  );
}
