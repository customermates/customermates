"use client";

import { useEffect, useRef, useState, type FocusEvent, type MouseEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

import { Editor } from "./editor";

const EDITOR_MENU = "[data-editor-menu]";
const INTERACTIVE_CONTENT = "a[href], button, input, [role='checkbox']";

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
      if (event.target instanceof Element && event.target.closest(EDITOR_MENU)) return;
      setEditing(false);
    };
    const finishOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !(event.target instanceof Node) || !rootRef.current?.contains(event.target)) return;
      if (document.querySelector(`${EDITOR_MENU}[data-state="open"]`)) return;
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
    if (!isEditing || !next || event.currentTarget.contains(next) || next.closest(EDITOR_MENU)) return;
    setEditing(false);
  };

  const startEditingOnClick = (event: MouseEvent<HTMLDivElement>) => {
    if (readOnly || isEditing) return;
    const interactive = event.target instanceof Element ? event.target.closest(INTERACTIVE_CONTENT) : null;
    if (interactive && event.currentTarget.contains(interactive)) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
    setEditing(true);
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
        data-formatted-text-area
        className={cn(
          "relative min-h-9 rounded-md border border-input bg-input-background px-3 py-1.5 text-sm",
          !readOnly &&
            !isEditing &&
            "cursor-text has-[[data-edit-trigger]:focus-visible]:border-ring has-[[data-edit-trigger]:focus-visible]:ring-[2px] has-[[data-edit-trigger]:focus-visible]:ring-ring/30",
          isEditing && "border-ring ring-[2px] ring-ring/30",
        )}
        role="presentation"
        onClick={startEditingOnClick}
      >
        <div
          ref={contentRef}
          className={cn(
            collapsed && "max-h-48 overflow-hidden",
            collapsed && overflowing && "mask-b-from-75% mask-b-to-100%",
            showPrompt && "hidden",
          )}
        >
          <Editor
            inline
            toolbar
            autoFocus={isEditing}
            data={data}
            label={label}
            readOnly={!isEditing}
            toolbarClassName="-mx-3 -mt-1.5 mb-1.5"
            onChange={onChange}
          />
        </div>

        {showPrompt && (
          <p className="py-0.5 text-sm text-muted-foreground">{t("RecordModel.addValue", { field: label })}</p>
        )}

        {!readOnly && !isEditing && (
          <button
            ref={editButtonRef}
            data-edit-trigger
            aria-label={t("RecordModel.editValue", { field: label })}
            className="sr-only"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setEditing(true);
            }}
          />
        )}
      </div>

      {!isEditing && (overflowing || expanded) && (
        <Button className="h-auto px-0" size="sm" type="button" variant="link" onClick={() => setExpanded(!expanded)}>
          {expanded ? t("Common.actions.showLess") : t("Common.actions.showMore")}
        </Button>
      )}
    </div>
  );
}
