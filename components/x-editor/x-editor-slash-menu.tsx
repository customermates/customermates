"use client";

import type { Editor } from "@tiptap/react";

import { Button } from "@heroui/button";
import {
  CheckCircleIcon,
  ListBulletIcon,
  NumberedListIcon,
  DocumentTextIcon,
  MinusIcon,
  Bars3BottomLeftIcon,
  HashtagIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

import { XIcon } from "../x-icon";

type SlashCommand = {
  title: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  command: () => void;
};

type Props = {
  editor: Editor;
  position: { top: number; left: number };
  slashMenuRef: React.RefObject<HTMLDivElement>;
  selectedCommandIndex: number;
  onCommandExecute: () => void;
  commandButtonRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  executeCommandRef: React.MutableRefObject<(() => void) | null>;
};

export function XEditorSlashMenu({
  editor,
  position,
  slashMenuRef,
  selectedCommandIndex,
  onCommandExecute,
  commandButtonRefs,
  executeCommandRef,
}: Props) {
  const t = useTranslations("Editor");

  const slashCommands = useMemo(
    (): SlashCommand[] => [
      {
        title: t("heading1"),
        icon: HashtagIcon,
        command: () =>
          editor
            ?.chain()
            .focus()
            .deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from })
            .toggleHeading({ level: 1 })
            .run(),
      },
      {
        title: t("heading2"),
        icon: HashtagIcon,
        command: () =>
          editor
            ?.chain()
            .focus()
            .deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from })
            .toggleHeading({ level: 2 })
            .run(),
      },
      {
        title: t("normalText"),
        icon: DocumentTextIcon,
        command: () =>
          editor
            ?.chain()
            .focus()
            .deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from })
            .setParagraph()
            .run(),
      },
      {
        title: t("bulletList"),
        icon: ListBulletIcon,
        command: () =>
          editor
            ?.chain()
            .focus()
            .deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from })
            .toggleBulletList()
            .run(),
      },
      {
        title: t("numberedList"),
        icon: NumberedListIcon,
        command: () =>
          editor
            ?.chain()
            .focus()
            .deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from })
            .toggleOrderedList()
            .run(),
      },
      {
        title: t("taskList"),
        icon: CheckCircleIcon,
        command: () =>
          editor
            ?.chain()
            .focus()
            .deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from })
            .toggleTaskList()
            .run(),
      },
      {
        title: t("blockQuote"),
        icon: Bars3BottomLeftIcon,
        command: () =>
          editor
            ?.chain()
            .focus()
            .deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from })
            .toggleBlockquote()
            .run(),
      },
      {
        title: t("divider"),
        icon: MinusIcon,
        command: () =>
          editor
            ?.chain()
            .focus()
            .deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from })
            .setHorizontalRule()
            .run(),
      },
    ],
    [editor, t],
  );

  useEffect(() => {
    executeCommandRef.current = () => {
      slashCommands[selectedCommandIndex]?.command();
    };
  }, [slashCommands, selectedCommandIndex, executeCommandRef]);

  return (
    <div
      ref={slashMenuRef}
      className="fixed max-h-52 overflow-y-auto z-50 w-72 bg-content1 shadow-medium rounded-large"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex flex-col py-2 px-3">
        {slashCommands.map((command, index) => (
          <Button
            key={command.title}
            ref={(el) => {
              commandButtonRefs.current[index] = el;
            }}
            className="w-full justify-start"
            size="sm"
            startContent={<XIcon icon={command.icon} />}
            variant={index === selectedCommandIndex ? "flat" : "light"}
            onPress={() => {
              command.command();
              onCommandExecute();
            }}
          >
            <div className="flex flex-col items-start gap-0.5">
              <div className="font-medium text-sm">{command.title}</div>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
