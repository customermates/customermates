"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { sanitizeHtml } from "@/components/shared/sanitize-html";
import { HTML_QUOTE_HIDE_CSS, htmlContainsQuote } from "@/ee/messaging/email-quote";

type Props = {
  html: string;
  showRemoteImages?: boolean;
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

function frameDocumentHeight(iframe: HTMLIFrameElement): number {
  const document = iframe.contentDocument;
  if (!document?.body) return MIN_FRAME_HEIGHT;

  return Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, document.body.scrollHeight, document.body.offsetHeight));
}

export function EmailFrame({ html, showRemoteImages = false }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [mounted, setMounted] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const t = useTranslations();

  useEffect(() => setMounted(true), []);

  const { srcDoc, hasQuote } = useMemo(() => {
    const sanitized = mounted ? sanitizeHtml(html) : "";
    const containsQuote = mounted && htmlContainsQuote(sanitized);
    const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:${showRemoteImages ? " https:" : ""};`;
    const quoteCss = containsQuote && !showQuoted ? `<style>${HTML_QUOTE_HIDE_CSS}</style>` : "";
    return {
      srcDoc: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${FRAME_CSS}</style>${quoteCss}</head><body>${sanitized}</body></html>`,
      hasQuote: containsQuote,
    };
  }, [html, showRemoteImages, mounted, showQuoted]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    const resize = () => {
      frame.style.height = `${frameDocumentHeight(frame)}px`;
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
  }, [srcDoc]);

  return (
    <>
      <iframe
        key={srcDoc}
        ref={frameRef}
        className="block w-full bg-white"
        sandbox="allow-same-origin"
        srcDoc={srcDoc}
        style={{ height: `${MIN_FRAME_HEIGHT}px`, minHeight: `${MIN_FRAME_HEIGHT}px` }}
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
