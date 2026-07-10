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

export function EmailFrame({ html, showRemoteImages = false }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
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
    const iframe = ref.current;
    if (!iframe) return;

    let observer: ResizeObserver | undefined;

    function measure() {
      const body = iframe?.contentDocument?.body;
      if (!body) return;
      const next = body.scrollHeight;
      if (next > 0) setHeight(next);
    }

    function attach() {
      measure();
      const body = iframe?.contentDocument?.body;
      if (body && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(measure);
        observer.observe(body);
      }
    }

    iframe.addEventListener("load", attach);
    if (iframe.contentDocument?.readyState === "complete") attach();

    return () => {
      iframe.removeEventListener("load", attach);
      observer?.disconnect();
    };
  }, [srcDoc]);

  return (
    <>
      <iframe
        ref={ref}
        className="block w-full bg-white"
        sandbox="allow-same-origin"
        srcDoc={srcDoc}
        style={{ height: `${height}px` }}
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
