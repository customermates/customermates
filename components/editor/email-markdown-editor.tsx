"use client";

import type { ComponentType, CSSProperties } from "react";

import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import type { MarkdownStorage } from "tiptap-markdown";
import { Bold, Italic, List, ListOrdered, Minus, Quote, Strikethrough } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { EmailSettings } from "@/ee/messaging/email-settings";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";
import { EMAIL_FONT_STACK, EmailLinkStyle, normalizeEmailLinkUrl } from "@/ee/messaging/email-settings";
import { EMAIL_STYLES } from "@/ee/messaging/email-styles";

import { LinkPopover } from "./link-popover";

import "./editor.scss";

export type EmailMarkdownEditorHandle = {
  focus: () => void;
  insertText: (text: string) => void;
};

type Props = {
  value: string;
  appearance: EmailSettings["appearance"];
  ariaLabel: string;
  id?: string;
  placeholder: string;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
  onSubmitShortcut?: () => void;
};

type ToggleAction = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: () => boolean;
  run: () => void;
};

function getMarkdown(storage: unknown): string {
  return (storage as { markdown: MarkdownStorage }).markdown.getMarkdown();
}

export const EmailMarkdownEditor = forwardRef<EmailMarkdownEditorHandle, Props>(function EmailMarkdownEditor(
  {
    value,
    appearance,
    ariaLabel,
    id,
    placeholder,
    className,
    disabled = false,
    invalid = false,
    onChange,
    onSubmitShortcut,
  },
  ref,
) {
  const t = useTranslations();
  const [linkOpen, setLinkOpen] = useState(false);
  const isSettingContentRef = useRef(false);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        underline: false,
        link: { defaultProtocol: "https" },
      }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({ html: false, linkify: true, breaks: true }),
    ],
    content: value,
    onUpdate: ({ editor: current }) => {
      if (!isSettingContentRef.current) onChange(getMarkdown(current.storage));
    },
    editorProps: {
      attributes: {
        id: id ?? "",
        "aria-label": ariaLabel,
        "aria-invalid": String(invalid),
        "aria-multiline": "true",
        class: "tiptap max-w-none min-h-24 px-3 py-2.5 focus:outline-none",
        role: "textbox",
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && onSubmitShortcut) {
          event.preventDefault();
          onSubmitShortcut();
          return true;
        }
        return false;
      },
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.chain().focus().run(),
      insertText: (text: string) => editor?.chain().focus().insertContent(text).run(),
    }),
    [editor],
  );

  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable === !disabled) return;
    editor.setEditable(!disabled, false);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    if (id) editor.view.dom.id = id;
    else editor.view.dom.removeAttribute("id");
    editor.view.dom.setAttribute("aria-invalid", String(invalid));
  }, [editor, id, invalid]);

  useEffect(() => {
    if (!editor) return;
    const current = getMarkdown(editor.storage);
    if (current === value) return;

    isSettingContentRef.current = true;
    editor.commands.setContent(value, { emitUpdate: false });
    isSettingContentRef.current = false;
  }, [editor, value]);

  if (!editor) return <div className={cn("min-h-24", className)} />;

  const toggles: ToggleAction[] = [
    {
      label: t("Editor.bold"),
      icon: Bold,
      active: () => editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: t("Editor.italic"),
      icon: Italic,
      active: () => editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: t("Editor.strikethrough"),
      icon: Strikethrough,
      active: () => editor.isActive("strike"),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: t("Editor.bulletList"),
      icon: List,
      active: () => editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: t("Editor.numberedList"),
      icon: ListOrdered,
      active: () => editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: t("Editor.blockQuote"),
      icon: Quote,
      active: () => editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ];
  const editorStyle = {
    "--email-link-color": appearance.linkHex,
    "--email-link-decoration": appearance.linkStyle === EmailLinkStyle.underlined ? "underline" : "none",
    "--email-block-gap": `${EMAIL_STYLES.blockGap}px`,
    "--email-list-indent": `${EMAIL_STYLES.listIndent}px`,
    "--email-quote-indent": `${EMAIL_STYLES.quoteIndent}px`,
    "--email-divider-color": EMAIL_STYLES.dividerColor,
    fontFamily: EMAIL_FONT_STACK[appearance.fontFamily],
    fontSize: `${appearance.fontSize}px`,
    lineHeight: `${appearance.fontSize + EMAIL_STYLES.lineHeightOffset}px`,
  } as CSSProperties;

  return (
    <div
      aria-invalid={invalid}
      className={cn(
        "email-markdown-editor bg-card overflow-hidden rounded-md border border-input",
        "focus-within:ring-ring/50 focus-within:ring-[3px]",
        invalid && "border-destructive",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      style={editorStyle}
    >
      <div
        aria-label={t("Editor.formatting")}
        className="border-border flex flex-wrap items-center gap-0.5 border-b p-1"
        role="toolbar"
      >
        {toggles.map((action) => (
          <Button
            key={action.label}
            aria-label={action.label}
            aria-pressed={action.active()}
            className={cn(action.active() && "bg-accent text-accent-foreground")}
            disabled={disabled}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={(event) => {
              if (event.detail === 0) action.run();
            }}
            onMouseDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              action.run();
            }}
          >
            <action.icon />
          </Button>
        ))}

        <LinkPopover
          disabled={disabled}
          editor={editor}
          normalizeUrl={normalizeEmailLinkUrl}
          open={linkOpen}
          onOpenChange={setLinkOpen}
        />

        <Button
          aria-label={t("Editor.divider")}
          disabled={disabled}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus />
        </Button>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
});
