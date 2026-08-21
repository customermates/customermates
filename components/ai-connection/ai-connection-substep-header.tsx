"use client";

import type { Ref } from "react";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  backDisabled: boolean;
  backLabel: string;
  showBack?: boolean;
  mode: "dialog" | "inline";
  headingRef: Ref<HTMLHeadingElement>;
  subtitle: string;
  title: string;
  onBack: () => void;
};

export function AiConnectionSubstepHeader({
  backDisabled,
  backLabel,
  showBack = true,
  mode,
  headingRef,
  subtitle,
  title,
  onBack,
}: Props) {
  if (mode === "dialog") return <p className="text-sm text-muted-foreground">{subtitle}</p>;

  return (
    <div className="flex flex-col gap-3">
      {showBack ? (
        <Button
          className="-ml-2 w-fit"
          disabled={backDisabled}
          size="sm"
          type="button"
          variant="ghost"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden />

          {backLabel}
        </Button>
      ) : null}

      <div className="flex flex-col gap-1">
        <h2
          ref={headingRef}
          className="rounded-sm text-lg font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          tabIndex={-1}
        >
          {title}
        </h2>

        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
