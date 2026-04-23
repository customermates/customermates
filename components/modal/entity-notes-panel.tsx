"use client";

import type {
  BaseCustomColumnEntityModalStore,
  EntityDto,
  FormEntityDto,
} from "@/core/base/base-custom-column-entity-modal.store";

import { FileText } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { Editor } from "@/components/editor/editor";
import { Icon } from "@/components/shared/icon";

type Props<Form extends FormEntityDto, Dto extends EntityDto> = {
  store: BaseCustomColumnEntityModalStore<Form, Dto>;
};

export const EntityNotesPanel = observer(function EntityNotesPanel<Form extends FormEntityDto, Dto extends EntityDto>({
  store,
}: Props<Form, Dto>) {
  const t = useTranslations("");
  const containerRef = useRef<HTMLDivElement>(null);

  function handleNotesChange(data: object) {
    store.onChange("notes", data);
  }

  function handleContainerMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest(".ProseMirror")) return;

    const editorEl = containerRef.current?.querySelector<HTMLElement>(".ProseMirror");
    if (!editorEl) return;

    event.preventDefault();
    editorEl.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editorEl);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-1 shrink-0">
        <Icon className="size-3.5 text-muted-foreground" icon={FileText} />

        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("Common.actions.labelNotes")}
        </span>
      </div>

      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- forwards clicks in the empty padding to the already-interactive ProseMirror editor inside */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto p-4 pt-2 cursor-text"
        onMouseDown={handleContainerMouseDown}
      >
        <Editor data={store.form.notes} onChange={handleNotesChange} />
      </div>
    </div>
  );
});
