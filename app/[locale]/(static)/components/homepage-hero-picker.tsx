"use client";

import type { ReactNode } from "react";

import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";

import { marketingButtonClassName } from "@/components/marketing/marketing-button";
import { AppLink } from "@/components/shared/app-link";

export type HomepageHeroChoice = {
  href: string;
  label: string;
  template: string;
};

type Props = {
  children?: ReactNode;
  choices: readonly HomepageHeroChoice[];
  cta: string;
  question: string;
};

export function homepageHeroCtaLabel(cta: string, choice: string): string {
  return cta.replace("{choice}", choice);
}

export function HomepageHeroPicker({ children, choices, cta, question }: Props) {
  const questionId = useId();
  const [selectedTemplate, setSelectedTemplate] = useState(choices[0]?.template);
  const selected = choices.find((choice) => choice.template === selectedTemplate) ?? choices[0];

  if (!selected) return null;

  return (
    <div data-homepage-hero-picker="">
      <div aria-labelledby={questionId} role="group">
        <p className="text-[0.8125rem] font-medium text-muted-foreground" id={questionId}>
          {question}
        </p>

        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          {choices.map((choice) => (
            <button
              key={choice.template}
              aria-pressed={choice.template === selected.template}
              className="mk-chip homepage-hero-chip"
              data-template={choice.template}
              type="button"
              onClick={() => setSelectedTemplate(choice.template)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-7 flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-2">
        <AppLink
          appearance="unstyled"
          className={marketingButtonClassName({ size: "lg" })}
          data-homepage-hero-cta=""
          href={selected.href}
        >
          {homepageHeroCtaLabel(cta, selected.label)}

          <ArrowRight aria-hidden data-mk-arrow="" />
        </AppLink>

        {children}
      </div>
    </div>
  );
}
