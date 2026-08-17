"use client";

import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { useRootStore } from "@/core/stores/root-store.provider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { findAgentTargetElement } from "./ui-control.store";

export const AgentTourOverlay = observer(function AgentTourOverlay() {
  const { agentUiControlStore: store } = useRootStore();
  const t = useTranslations();
  const copy = tourCopy(t);
  const [rect, setRect] = useState<DOMRect | null>(null);
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

  if (!active) return null;
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
        <Popover open={hasRect}>
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
              <div className="-mt-1 -mr-1 flex items-center justify-between gap-2">
                <span aria-live="polite" className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {`${active.stepIndex + 1} / ${active.totalSteps}`}
                </span>

                <Button
                  aria-label={t("AgentChat.tour.skip")}
                  className="size-7"
                  size="icon"
                  variant="ghost"
                  onClick={store.end}
                >
                  <X />
                </Button>
              </div>

              {active.note && (
                <p aria-live="polite" className="mt-1 text-sm">
                  {active.note}
                </p>
              )}

              <div className="mt-3 flex justify-end gap-2">
                <Button disabled={active.stepIndex === 0} size="sm" variant="outline" onClick={store.previousStep}>
                  {copy.back}
                </Button>

                <Button ref={nextButtonRef} size="sm" onClick={store.nextStep}>
                  {active.stepIndex + 1 >= active.totalSteps ? t("AgentChat.tour.done") : t("AgentChat.tour.next")}
                </Button>
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
    title: t("AgentChat.tourUi.title"),
  };
}
