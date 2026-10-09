"use client";

import { useEffect, useRef, useState, type FocusEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

import { Editor } from "./editor";

const EDITOR_POPOVER = '[data-slot="popover-content"]';

type DocumentNode = { type?: string; content?: DocumentNode[] };

function isEmptyDocument(data: object | undefined) {
  const blocks = (data as DocumentNode | undefined)?.content ?? [];
  return blocks.every((block) => block.type === "paragraph" && !block.content?.length);
}

export function FormattedTextField({
  data,
  label,
  readOnly = false,
  onChange,
}: {
  data?: object;
  label: string;
  readOnly?: boolean;
  onChange?: (data: object) => void;
}) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const isEditing = editing && !readOnly;
  const collapsed = !isEditing && !expanded;
  const showPrompt = !readOnly && !isEditing && isEmptyDocument(data);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => setOverflowing(content.scrollHeight > content.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    if (content.firstElementChild) observer.observe(content.firstElementChild);
    return () => observer.disconnect();
  }, [collapsed, data]);

  useEffect(() => {
    if (!isEditing) return;
    const finishOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || rootRef.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest(EDITOR_POPOVER)) return;
      setEditing(false);
    };
    const finishOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !(event.target instanceof Node) || !rootRef.current?.contains(event.target)) return;
      if (document.querySelector(EDITOR_POPOVER)) return;
      event.preventDefault();
      event.stopPropagation();
      setEditing(false);
      requestAnimationFrame(() => editButtonRef.current?.focus());
    };
    document.addEventListener("pointerdown", finishOutside);
    window.addEventListener("keydown", finishOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", finishOutside);
      window.removeEventListener("keydown", finishOnEscape, true);
    };
  }, [isEditing]);

  const finishOnBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (!isEditing || !next || event.currentTarget.contains(next) || next.closest(EDITOR_POPOVER)) return;
    setEditing(false);
  };

  return (
    <div
      ref={rootRef}
      data-formatted-text-field
      className="min-w-0 space-y-1"
      data-state={isEditing ? "editing" : "display"}
      onBlur={finishOnBlur}
    >
      <div
        className={cn(
          "relative -mx-2 rounded-md px-2 py-1",
          !readOnly && "min-h-8",
          !readOnly && !isEditing && "hover:bg-muted/60",
          isEditing && "ring-1 ring-ring",
        )}
      >
        <div
          ref={contentRef}
          className={cn(
            collapsed && "max-h-48 overflow-hidden",
            collapsed && overflowing && "mask-b-from-75% mask-b-to-100%",
            showPrompt && "hidden",
          )}
        >
          <Editor inline autoFocus={isEditing} data={data} label={label} readOnly={!isEditing} onChange={onChange} />
        </div>

        {showPrompt && (
          <p className="py-0.5 text-sm text-muted-foreground">{t("RecordModel.addValue", { field: label })}</p>
        )}

        {!readOnly && !isEditing && (
          <button
            ref={editButtonRef}
            aria-label={t("RecordModel.editValue", { field: label })}
            className="absolute inset-0 cursor-text rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={() => setEditing(true)}
          />
        )}
      </div>

      {!isEditing && (overflowing || expanded) && (
        <Button className="h-auto px-0" size="sm" type="button" variant="link" onClick={() => setExpanded(!expanded)}>
          {t(expanded ? "Common.actions.showLess" : "Common.actions.showMore")}
        </Button>
      )}
    </div>
  );
}
