import { Github } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppLink } from "@/components/shared/app-link";

type Props = {
  className?: string;
};

export function AgplGithubBadge({ className }: Props) {
  const t = useTranslations("AgplGithubBadge");
  const label = t("label");

  return (
    <AppLink
      external
      className={`mb-[18px] inline-flex items-center gap-2 rounded-full border border-border bg-card px-[11px] py-[5px] text-xs shadow-[var(--shadow-xs)] transition-shadow hover:shadow-sm ${className ?? ""}`}
      href="https://github.com/customermates/customermates"
    >
      <Github aria-hidden className="size-3.5" />

      <span className="font-semibold">{label}</span>

      <span aria-hidden className="relative inline-flex size-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#34c759] opacity-75" />

        <span className="relative size-1.5 rounded-full bg-[#34c759]" />
      </span>
    </AppLink>
  );
}
