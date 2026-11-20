import { ArrowRight } from "lucide-react";

import { AppLink } from "@/components/shared/app-link";

export type TemplateCardData = {
  family: string;
  familyLabel: string;
  href: string;
  name: string;
  slug: string;
  summary: string;
};

type Props = {
  copyLabel: string;
  data: TemplateCardData;
  worksWith: string;
};

export function TemplateCard({ copyLabel, data, worksWith }: Props) {
  return (
    <li
      className="mk-card mk-card-interactive group flex"
      data-template-card={data.slug}
      data-template-family={data.family}
    >
      <div className="relative flex size-full flex-col p-6">
        <p className="mk-eyebrow">{data.familyLabel}</p>

        <h3 className="mt-2 text-lg leading-snug font-semibold text-balance">
          <AppLink
            appearance="unstyled"
            className="text-foreground after:absolute after:inset-0 after:content-['']"
            href={data.href}
          >
            {data.name}
          </AppLink>
        </h3>

        <p className="mt-3 flex-1 text-sm leading-6 text-subdued">{data.summary}</p>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-subdued">
          <span className="min-w-0">{worksWith}</span>

          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground">
            {copyLabel}

            <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </li>
  );
}
