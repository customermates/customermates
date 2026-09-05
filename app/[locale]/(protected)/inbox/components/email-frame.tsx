"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { sanitizeHtml } from "@/components/shared/sanitize-html";
import { HTML_QUOTE_HIDE_CSS, htmlContainsQuote } from "@/ee/messaging/email-quote";

type Props = {
  html: string;
  showRemoteImages?: boolean;
  presentation?: "email" | "composer";
};

const FRAME_CSS = `
  html, body { margin: 0; padding: 0; }
  body {
    padding: 12px 16px;
    background: #ffffff;
    color: #1a1a1a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  img, video { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #2563eb; }
`;

const MIN_FRAME_HEIGHT = 96;
const MAX_FRAME_HEIGHT = 640;

function frameDocumentHeight(iframe: HTMLIFrameElement, minimumHeight: number): number {
  const document = iframe.contentDocument;
  if (!document?.body) return minimumHeight;

  return Math.min(MAX_FRAME_HEIGHT, Math.max(minimumHeight, document.body.scrollHeight, document.body.offsetHeight));
}

export function EmailFrame({ html, showRemoteImages = false, presentation = "email" }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [mounted, setMounted] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const [foreground, setForeground] = useState("#1a1a1a");
  const { resolvedTheme } = useTheme();
  const t = useTranslations();
  const isComposer = presentation === "composer";
  const minimumHeight = isComposer ? 24 : MIN_FRAME_HEIGHT;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isComposer) return;
    const updateForeground = () => {
      const color = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim();
      if (color) setForeground(color);
    };
    updateForeground();
    const observer = new MutationObserver(updateForeground);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
  }, [isComposer, resolvedTheme]);

  const { srcDoc, hasQuote } = useMemo(() => {
    const sanitized = mounted ? sanitizeHtml(html) : "";
    const containsQuote = mounted && htmlContainsQuote(sanitized);
    const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:${showRemoteImages ? " https:" : ""};`;
    const quoteCss = containsQuote && !showQuoted ? `<style>${HTML_QUOTE_HIDE_CSS}</style>` : "";
    const composerCss = isComposer
      ? `<style>html { color-scheme: ${resolvedTheme === "dark" ? "dark" : "light"}; background: transparent; } body { padding: 0; background: transparent; } body, table, td, [data-customermates-email-markdown] { color: ${foreground} !important; } body > :last-child { margin-bottom: 0 !important; }</style>`
      : "";
    return {
      srcDoc: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${FRAME_CSS}</style>${composerCss}${quoteCss}</head><body>${sanitized}</body></html>`,
      hasQuote: containsQuote,
    };
  }, [html, showRemoteImages, mounted, showQuoted, isComposer, foreground, resolvedTheme]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    const resize = () => {
      frame.style.height = `${frameDocumentHeight(frame, minimumHeight)}px`;
    };
    const observe = () => {
      observer?.disconnect();
      if (frame.contentDocument?.body) {
        observer = new ResizeObserver(resize);
        observer.observe(frame.contentDocument.body);
      }
      resize();
    };
    frame.addEventListener("load", observe);
    observe();
    return () => {
      frame.removeEventListener("load", observe);
      observer?.disconnect();
    };
  }, [srcDoc, minimumHeight]);

  return (
    <>
      <iframe
        key={srcDoc}
        ref={frameRef}
        className={isComposer ? "text-foreground block w-full bg-transparent" : "block w-full bg-white"}
        sandbox="allow-same-origin"
        srcDoc={srcDoc}
        style={{
          height: `${minimumHeight}px`,
          minHeight: `${minimumHeight}px`,
        }}
        title={t("Inbox.compose.emailContent")}
      />

      {hasQuote && (
        <button
          className="text-muted-foreground hover:text-foreground self-start px-3.5 py-1.5 text-xs underline underline-offset-2"
          type="button"
          onClick={() => setShowQuoted((prev) => !prev)}
        >
          {showQuoted ? t("Inbox.hideQuotedText") : t("Inbox.showQuotedText")}
        </button>
      )}
    </>
  );
}
