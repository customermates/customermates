"use client";

import type { CSSProperties } from "react";

import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import type { MarkdownStorage } from "tiptap-markdown";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { EmailSettings } from "@/ee/messaging/email-settings";

import { cn } from "@/core/utils/cn";
import { EMAIL_FONT_STACK, EmailLinkStyle, normalizeEmailLinkUrl } from "@/ee/messaging/email-settings";
import { EMAIL_STYLES } from "@/ee/messaging/email-styles";

import { FormattingToolbar } from "./formatting-toolbar";

import { isShortcutPress } from "@/components/keyboard/shortcut-registry";
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
        if (onSubmitShortcut && isShortcutPress(event, "save")) {
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
      <FormattingToolbar disabled={disabled} editor={editor} normalizeLinkUrl={normalizeEmailLinkUrl} />

      <EditorContent editor={editor} />
    </div>
  );
});
