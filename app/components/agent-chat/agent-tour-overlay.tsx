"use client";

import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { findAgentTargetElement } from "./ui-control.store";

export const AgentTourOverlay = observer(function AgentTourOverlay() {
  const { agentUiControlStore: store } = useRootStore();
  const t = useTranslations();
  const copy = tourCopy(t);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const active = store.active;
  const hasRect = Boolean(rect);

  useEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }

    const update = () => {
      const element = findAgentTargetElement(active.targetId);
      setRect(element ? element.getBoundingClientRect() : null);
    };
    update();
    const interval = setInterval(update, 300);
    window.addEventListener("resize", update);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", update);
    };
  }, [active]);

  useEffect(() => {
    if (!active || !store.isTourPaused) return;
    requestAnimationFrame(() => resumeButtonRef.current?.focus());
  }, [active, store.isTourPaused]);

  if (!active) return null;
  if (store.isTourPaused) {
    return (
      <Button
        ref={resumeButtonRef}
        className="fixed z-50 rounded-full shadow-lg"
        style={{
          right: "max(1rem, var(--safe-right))",
          bottom: "max(1rem, var(--safe-bottom))",
        }}
        onClick={store.resume}
      >
        {copy.resume}
      </Button>
    );
  }
  if (!rect) return null;

  const isTour = active.note !== null;

  return (
    <>
      <div
        className="pointer-events-none fixed z-50 rounded-lg border-2 border-primary"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
        }}
      />

      {isTour && (
        <Popover open={!store.isTourPaused && hasRect}>
          <PopoverAnchor asChild>
            <div
              className="pointer-events-none fixed"
              style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            />
          </PopoverAnchor>

          <PopoverContent
            align="start"
            className="w-80 p-3"
            side="bottom"
            onEscapeKeyDown={store.end}
            onOpenAutoFocus={() => nextButtonRef.current?.focus({ preventScroll: true })}
          >
            <PopoverTitle className="sr-only">{copy.title}</PopoverTitle>

            <div>
              {active.note && (
                <p aria-live="polite" className="text-sm">
                  {active.note}
                </p>
              )}

              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
                  {`${active.stepIndex + 1} / ${active.totalSteps}`}
                </span>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={store.end}>
                    {t("AgentChat.tour.skip")}
                  </Button>

                  <Button size="sm" variant="ghost" onClick={store.pause}>
                    {copy.pause}
                  </Button>

                  <Button disabled={active.stepIndex === 0} size="sm" variant="outline" onClick={store.previousStep}>
                    {copy.back}
                  </Button>

                  <Button ref={nextButtonRef} size="sm" onClick={store.nextStep}>
                    {active.stepIndex + 1 >= active.totalSteps ? t("AgentChat.tour.done") : t("AgentChat.tour.next")}
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
});

function tourCopy(t: ReturnType<typeof useTranslations>) {
  return {
    back: t("AgentChat.tourUi.back"),
    pause: t("AgentChat.tourUi.pause"),
    resume: t("AgentChat.tourUi.resume"),
    title: t("AgentChat.tourUi.title"),
  };
}
