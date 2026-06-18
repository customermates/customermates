"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { sanitizeHtml } from "@/components/shared/sanitize-html";
import { cn } from "@/lib/utils";

type Props = {
  html: string;
  /** Controlled remote-image toggle (inbox owns it via the bottom action row). Omit to let the frame manage its own button. */
  showRemoteImages?: boolean;
  isOutbound?: boolean;
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

export function EmailFrame({ html, showRemoteImages: controlled, isOutbound = false }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const [internalRemoteImages, setInternalRemoteImages] = useState(false);
  const [mounted, setMounted] = useState(false);
  const t = useTranslations();

  const isControlled = controlled !== undefined;
  const showRemoteImages = isControlled ? controlled : internalRemoteImages;

  useEffect(() => setMounted(true), []);

  const srcDoc = useMemo(() => {
    const sanitized = mounted ? sanitizeHtml(html) : "";
    const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:${showRemoteImages ? " https:" : ""};`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${FRAME_CSS}</style></head><body>${sanitized}</body></html>`;
  }, [html, showRemoteImages, mounted]);

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
    <div className="w-full space-y-2">
      {!isControlled && !showRemoteImages && (
        <button
          className="text-xs font-medium text-blue-600 hover:underline"
          type="button"
          onClick={() => setInternalRemoteImages(true)}
        >
          {t("Inbox.compose.loadRemoteImages")}
        </button>
      )}

      <iframe
        ref={ref}
        className={cn(
          "block w-full overflow-hidden rounded-xl bg-white shadow-xs",
          isOutbound ? "rounded-tr-sm" : "rounded-tl-sm",
        )}
        sandbox="allow-same-origin"
        srcDoc={srcDoc}
        style={{ height: `${height}px` }}
        title={t("Inbox.compose.emailContent")}
      />
    </div>
  );
}
