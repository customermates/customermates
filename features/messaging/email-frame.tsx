"use client";

import type { EmailFramePalette } from "./email-frame-theme";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import DOMPurify from "dompurify";

import { sanitizeEmailFrameResources } from "./email-frame-resources";
import { emailFrameThemeCss, emailFrameTone, readEmailFramePalette } from "./email-frame-theme";
import { cn } from "@/core/utils/cn";
import { HTML_QUOTE_HIDE_CSS, htmlContainsQuote } from "@/ee/messaging/email-quote";

type Props = {
  html: string;
  showRemoteImages?: boolean;
  presentation?: "email" | "composer";
};

const FRAME_CSS = `
  html, body { margin: 0; padding: 0; }
  html { background: #ffffff; color: #1a1a1a; }
  body {
    padding: 12px 16px;
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
const MIN_THEMED_FRAME_HEIGHT = 32;
const MAX_FRAME_HEIGHT = 640;
const ADAPTIVE_SCHEME_META = '<meta name="color-scheme" content="light dark">';

function frameDocumentHeight(iframe: HTMLIFrameElement, minimumHeight: number): number {
  const document = iframe.contentDocument;
  if (!document?.body) return minimumHeight;

  return Math.min(MAX_FRAME_HEIGHT, Math.max(minimumHeight, document.body.scrollHeight, document.body.offsetHeight));
}

export function EmailFrame({ html, showRemoteImages = false, presentation = "email" }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [mounted, setMounted] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const [palette, setPalette] = useState<EmailFramePalette | null>(null);
  const { resolvedTheme } = useTheme();
  const t = useTranslations();
  const isComposer = presentation === "composer";
  const scheme = resolvedTheme === "dark" ? "dark" : "light";
  const foreground = palette?.foreground ?? "#1a1a1a";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const updatePalette = () => setPalette(readEmailFramePalette());
    updatePalette();
    const observer = new MutationObserver(updatePalette);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, [resolvedTheme]);

  const tone = useMemo(() => (mounted && !isComposer ? emailFrameTone(html) : "own"), [html, mounted, isComposer]);
  const onPaper = tone === "paper" && !isComposer;
  const minimumHeight = isComposer ? 24 : onPaper ? MIN_FRAME_HEIGHT : MIN_THEMED_FRAME_HEIGHT;

  const { srcDoc, hasQuote } = useMemo(() => {
    const sanitized = mounted
      ? DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, RETURN_DOM: true, ADD_ATTR: ["text"] })
      : undefined;
    const sanitizedRoot = sanitized && sanitized instanceof HTMLElement ? sanitized : undefined;
    if (sanitizedRoot) sanitizeEmailFrameResources(sanitizedRoot, showRemoteImages, document.baseURI);
    const containsQuote = mounted && htmlContainsQuote(sanitizedRoot?.outerHTML ?? "");
    const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:${showRemoteImages ? " https:" : ""};`;
    const quoteCss = containsQuote && !showQuoted ? `<style>${HTML_QUOTE_HIDE_CSS}</style>` : "";
    const composerCss = isComposer
      ? `<style>html { color-scheme: ${scheme}; background: transparent; } body { padding: 0; background: transparent; } body, table, td, [data-customermates-email-markdown] { color: ${foreground} !important; } body > :last-child { margin-bottom: 0 !important; }</style>`
      : "";
    const themeCss = !isComposer && palette ? emailFrameThemeCss(tone, scheme, palette) : "";
    const toneHead = themeCss ? `${tone === "adaptive" ? ADAPTIVE_SCHEME_META : ""}<style>${themeCss}</style>` : "";
    const headContent = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${FRAME_CSS}</style>${toneHead}${composerCss}${quoteCss}`;
    const head = sanitizedRoot?.querySelector("head");
    let frameHtml = `<html><head>${headContent}</head><body></body></html>`;
    if (sanitizedRoot && head) {
      head.insertAdjacentHTML("afterbegin", headContent);
      frameHtml = sanitizedRoot.outerHTML;
    }
    return {
      srcDoc: `<!doctype html>${frameHtml}`,
      hasQuote: containsQuote,
    };
  }, [html, showRemoteImages, mounted, showQuoted, isComposer, foreground, scheme, tone, palette]);

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

  const frame = (
    <iframe
      key={srcDoc}
      ref={frameRef}
      className={cn("block w-full", onPaper ? "bg-white" : "text-foreground bg-transparent")}
      data-email-tone={isComposer ? undefined : tone}
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      style={{
        colorScheme: isComposer ? undefined : onPaper ? "light" : scheme,
        height: `${minimumHeight}px`,
        minHeight: `${minimumHeight}px`,
      }}
      title={t("Inbox.compose.emailContent")}
    />
  );

  return (
    <>
      {onPaper ? (
        <div className="border-border mx-2.5 mt-2 mb-2.5 overflow-hidden rounded-lg border bg-white">{frame}</div>
      ) : (
        frame
      )}

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
