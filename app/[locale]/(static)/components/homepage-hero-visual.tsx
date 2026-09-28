"use client";

import type { Hero } from "@/core/fumadocs/schemas/homepage";

import { useEffect, useState } from "react";
import { Check, FilePenLine, Loader2, RotateCcw } from "lucide-react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { VISUAL_PERSON_FIXTURES } from "@/components/marketing/visuals/native-fixtures";
import { PersonAvatar, ProviderMark } from "@/components/marketing/visuals/native-visual-primitives";

import { useHomepageMotion } from "./homepage-motion";

const CLIENTS = ["claude", "gemini", "cursor", "grok"] as const;
const CLIENT_NAMES = { claude: "Claude", gemini: "Gemini", cursor: "Cursor", grok: "Grok Bot" };
const PROVIDERS = ["linkedin", "whatsapp", "gmail"] as const;
const PHASE_DELAYS = [800, 1100, 1100, 1100, 1100, 500];

export function HomepageHeroVisual({ copy }: { copy: NonNullable<Hero["illustration"]> }) {
  const { ref, shouldAnimate, shouldReduceMotion } = useHomepageMotion<HTMLElement>(0.35);
  const [phase, setPhase] = useState(0);
  const currentPhase = shouldReduceMotion ? 6 : phase;
  const done = currentPhase >= 5;

  useEffect(() => {
    if (!shouldAnimate || phase >= 6) return;
    const timeout = window.setTimeout(() => setPhase((value) => value + 1), PHASE_DELAYS[phase]);
    return () => window.clearTimeout(timeout);
  }, [phase, shouldAnimate]);

  function replay() {
    setPhase(0);
  }

  const contactChip = (
    <AppChip
      className="inline-flex align-middle"
      startContent={<PersonAvatar decorative person="leon-becker" size={16} />}
    >
      {VISUAL_PERSON_FIXTURES["leon-becker"].name}
    </AppChip>
  );

  return (
    <figure
      ref={ref}
      aria-label={copy.label}
      className="min-w-0 overflow-hidden rounded-2xl border border-border bg-background"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5 text-sm font-medium">
          <AiClientLogo className="size-4" provider="chatgpt" />
          ChatGPT
        </div>

        <div className="flex items-center gap-3">
          <ul className="flex items-center gap-3">
            {CLIENTS.map((provider) => (
              <li key={provider} aria-label={CLIENT_NAMES[provider]} title={CLIENT_NAMES[provider]}>
                <AiClientLogo className="size-4" provider={provider} />
              </li>
            ))}
          </ul>

          {!shouldReduceMotion && (
            <Button
              aria-label={copy.replay}
              className="size-7 border border-border text-muted-foreground"
              size="icon"
              variant="ghost"
              onClick={replay}
            >
              <RotateCcw aria-hidden className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-[22rem] space-y-3 px-4 py-5 sm:px-5 sm:py-6">
        <div className="flex justify-end">
          <div className="w-fit min-w-16 max-w-[85%] rounded-xl rounded-br-md bg-muted px-3.5 py-2 text-sm leading-5 shadow-xs dark:bg-accent/60">
            {copy.prompt}
          </div>
        </div>

        <div className="py-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {done ? (
              <Check aria-hidden className="size-3.5 shrink-0" />
            ) : currentPhase === 0 ? (
              <span aria-hidden className="flex w-3.5 shrink-0 items-center gap-0.5">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="size-1 animate-typing-dot rounded-full bg-muted-foreground/60 motion-reduce:animate-none"
                    style={{ animationDelay: `${dot * 160}ms` }}
                  />
                ))}
              </span>
            ) : (
              <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
            )}

            <span className="grid flex-1">
              <span aria-hidden={done} className={`col-start-1 row-start-1 ${done ? "invisible" : ""}`}>
                {copy.working}
              </span>

              <span aria-hidden={!done} className={`col-start-1 row-start-1 ${done ? "" : "invisible"}`}>
                {copy.context}
              </span>
            </span>
          </div>

          <ol className={`mt-3 space-y-3 pl-4 ${currentPhase === 0 ? "invisible" : ""}`}>
            {copy.steps.map((step, index) => {
              const revealed = currentPhase >= index + 1;
              const completed = currentPhase > index + 1;
              const provider = PROVIDERS[index];
              return (
                <li
                  key={step.done}
                  aria-hidden={!revealed}
                  className={`relative flex items-center gap-2 text-xs ${revealed ? "animate-in fade-in-0 slide-in-from-top-2 duration-300 motion-reduce:animate-none" : "invisible"}`}
                >
                  <span
                    aria-hidden
                    data-step-connector
                    className={`absolute -left-4 bottom-0 w-px origin-top bg-border transition-transform duration-300 motion-reduce:transition-none ${index === 0 ? "top-0" : "-top-3"}`}
                    style={{ transform: `scaleY(${revealed ? 1 : 0})` }}
                  />

                  {provider ? (
                    <ProviderMark provider={provider} size={14} />
                  ) : (
                    <FilePenLine aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                  )}

                  <span className="grid min-w-0 flex-1">
                    <span aria-hidden={completed} className={`col-start-1 row-start-1 ${completed ? "invisible" : ""}`}>
                      {step.running}
                    </span>

                    <span
                      aria-hidden={!completed}
                      className={`col-start-1 row-start-1 ${completed ? "" : "invisible"}`}
                    >
                      {step.done}
                    </span>
                  </span>

                  <Loader2
                    aria-hidden
                    className={`size-3.5 shrink-0 text-muted-foreground ${completed ? "invisible" : "animate-spin motion-reduce:animate-none"}`}
                  />
                </li>
              );
            })}
          </ol>
        </div>

        <div
          key={currentPhase >= 6 ? "response" : "reserved-response"}
          data-hero-response
          aria-hidden={currentPhase < 6}
          className={`space-y-3 ${currentPhase >= 6 ? "animate-in fade-in-0 duration-300 motion-reduce:animate-none" : "invisible"}`}
          inert={currentPhase < 6}
        >
          <p className="text-sm leading-relaxed">
            {/* eslint-disable-next-line react/jsx-newline */}
            {copy.response} {contactChip}.
          </p>

          <div className="rounded-xl border border-border px-3.5 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <ProviderMark provider="linkedin" size={14} />

              {copy.draftLabel}
            </div>

            <p className="text-sm leading-relaxed">{copy.draft}</p>
          </div>
        </div>
      </div>
    </figure>
  );
}
