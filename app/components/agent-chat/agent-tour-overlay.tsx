"use client";

import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { useRootStore } from "@/core/stores/root-store.provider";
import { MessageResponse } from "@/components/ai-elements/message";
import { assistantSurfaceProps, claimEscapeForAssistant } from "@/components/modal/assistant-surface";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { OVERLAY_TOPMOST_LAYER_CLASS } from "@/components/ui/overlay-contract";
import { usableOverlayFocusTarget } from "@/components/ui/overlay-focus-target";
import { cn } from "@/core/utils/cn";
import { findAgentTargetElement } from "./ui-control.store";

export function AgentTourNote({ note }: { note: string }) {
  return (
    <div aria-live="polite" className="mt-1 text-sm">
      <MessageResponse key={note} controls={false} mode="static" showTableActions={false}>
        {note}
      </MessageResponse>
    </div>
  );
}

export const AgentTourOverlay = observer(function AgentTourOverlay() {
  const { agentUiControlStore: store } = useRootStore();
  const t = useTranslations();
  const copy = tourCopy(t);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const active = store.active;

  useEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }

    const update = () => {
      const element = findAgentTargetElement(active.targetId);
      setRect(element ? element.getBoundingClientRect() : null);
      store.reportTourTarget(active, element !== null);
    };
    update();
    const interval = setInterval(update, 300);
    window.addEventListener("resize", update);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", update);
    };
  }, [active, store]);

  useEffect(() => {
    if (!active || active.note === null) return;

    const endOnAssistantEscape = (event: KeyboardEvent) => {
      if (claimEscapeForAssistant(event)) store.end();
    };
    const rememberPageFocus = (event: FocusEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest("[data-agent-surface]") &&
        usableOverlayFocusTarget(event.target)
      )
        store.rememberPageFocus(event.target);
    };
    document.addEventListener("keydown", endOnAssistantEscape);
    document.addEventListener("focusin", rememberPageFocus);
    return () => {
      document.removeEventListener("keydown", endOnAssistantEscape);
      document.removeEventListener("focusin", rememberPageFocus);
    };
  }, [active, store]);

  if (!active) return null;

  const isTour = active.note !== null;
  if (!rect && !isTour) return null;

  return (
    <>
      {rect && (
        <div
          className={cn("pointer-events-none fixed rounded-lg border-2 border-primary", OVERLAY_TOPMOST_LAYER_CLASS)}
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
          }}
        />
      )}

      {isTour && (
        <Popover open>
          <PopoverAnchor asChild>
            <div
              className="pointer-events-none fixed"
              style={
                rect
                  ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
                  : { top: "50%", left: "50%", width: 0, height: 0 }
              }
            />
          </PopoverAnchor>

          <PopoverContent
            {...assistantSurfaceProps()}
            align={rect ? "start" : "center"}
            className={cn("w-80 p-3", OVERLAY_TOPMOST_LAYER_CLASS)}
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

              {active.note && <AgentTourNote note={active.note} />}

              <div className="mt-3 flex justify-end gap-2">
                <Button disabled={active.stepIndex === 0} size="sm" variant="secondary" onClick={store.previousStep}>
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
    back: t("Common.actions.back"),
    title: t("AgentChat.tourUi.title"),
  };
}
