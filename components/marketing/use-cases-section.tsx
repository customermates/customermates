import type { UseCases } from "@/core/fumadocs/schemas/use-cases";

import { ArrowRight } from "lucide-react";

import { AppLink } from "@/components/shared/app-link";
import { cn } from "@/core/utils/cn";

import { MarketingSection } from "./marketing-section";
import { SectionHeader } from "./section-header";
import { UseCaseCapture, hasUseCaseCapture, conversationChannel } from "./use-case-capture";
import { UseCaseVisual } from "./use-case-visual";

type Props = {
  useCases: UseCases;
};

export function UseCasesSection({ useCases }: Props) {
  const { description, eyebrow, items, title } = useCases;

  return (
    <MarketingSection className="mk-section" id="use-cases">
      <SectionHeader description={description} eyebrow={eyebrow} title={title} />

      <ul
        className={cn("grid gap-4 sm:grid-cols-2", items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}
        data-use-cases=""
      >
        {items.map((item) => (
          <li key={item.title} data-reveal className="mk-card mk-card-interactive group overflow-hidden">
            <AppLink appearance="unstyled" className="flex h-full flex-col" href={item.href}>
              {hasUseCaseCapture(item.visual) ? (
                <UseCaseCapture channel={conversationChannel(item)} kind={item.visual} />
              ) : (
                <UseCaseVisual kind={item.visual} />
              )}

              <span className="flex flex-1 flex-col p-6">
                <span className="block text-lg font-semibold tracking-tight text-balance text-foreground">
                  {item.title}
                </span>

                <span className="mt-2 block flex-1 text-sm leading-6 text-muted-foreground">{item.description}</span>

                <span className="mk-link mt-6">
                  {item.linkLabel}

                  <ArrowRight aria-hidden />
                </span>
              </span>
            </AppLink>
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}
