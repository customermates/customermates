"use client";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import { findAgentTargetElement } from "../ui-targets";

export const AgentTourOverlay = observer(() => {
  const t = useTranslations();
  const { agentUiControlStore: ui } = useRootStore();
  const active = ui.active;

  const tooltipRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 16, y: 80 });

  const targetId = active?.targetId ?? null;

  useEffect(() => {
    if (!targetId) {
      setRect(null);
      return;
    }
    const el = findAgentTargetElement(targetId);
    if (!el) {
      setRect(null);
      return;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    const update = () => {
      setRect(el.getBoundingClientRect());
      const tooltip = tooltipRef.current;
      if (tooltip) {
        void computePosition(el, tooltip, {
          strategy: "fixed",
          placement: "bottom",
          middleware: [offset(12), flip(), shift({ padding: 8 })],
        }).then(({ x, y }) => setPos({ x, y }));
      }
    };

    update();
    const cleanup = autoUpdate(el, tooltipRef.current ?? el, update);
    return cleanup;
  }, [targetId]);

  if (!active) return null;

  const isTour = active.stepIndex !== undefined;
  const isLastStep = isTour && active.stepIndex === (active.stepCount ?? 1) - 1;

  return (
    <>
      {/* Spotlight mask sits BELOW the non-modal chat panel (z-50) so the chat stays bright. */}
      {rect && (
        <motion.div
          aria-hidden
          animate={{ opacity: 1 }}
          className="pointer-events-none fixed z-40 rounded-md ring-2 ring-primary"
          initial={{ opacity: 0 }}
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      )}

      {/* Tooltip sits ABOVE the chat panel so it's always visible. */}
      <motion.div
        ref={tooltipRef}
        animate={{ opacity: 1, scale: 1 }}
        className="pointer-events-auto fixed z-[60] max-w-xs rounded-lg border border-border bg-background p-3 shadow-lg"
        initial={{ opacity: 0, scale: 0.98 }}
        style={{ top: pos.y, left: pos.x }}
      >
        {active.title && <div className="text-sm font-semibold text-foreground">{active.title}</div>}

        {active.body && <div className="mt-1 text-sm text-muted-foreground">{active.body}</div>}

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {isTour ? `${(active.stepIndex ?? 0) + 1} / ${active.stepCount}` : ""}
          </span>

          <div className="flex gap-2">
            {isTour && (active.stepIndex ?? 0) > 0 && (
              <Button size="sm" variant="ghost" onClick={ui.prev}>
                {t("AgentChat.tour.prev")}
              </Button>
            )}

            {isTour ? (
              <Button size="sm" onClick={ui.next}>
                {isLastStep ? t("AgentChat.tour.done") : t("AgentChat.tour.next")}
              </Button>
            ) : (
              <Button size="sm" onClick={ui.end}>
                {t("AgentChat.tour.gotIt")}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
});
