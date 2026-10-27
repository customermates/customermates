"use client";

import type { ReactNode } from "react";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ban, Loader2, RotateCw } from "lucide-react";

import { formatRetryAfter } from "@/ee/messaging/retry-after";
import { cn } from "@/core/utils/cn";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { localizedContentHref } from "@/components/shared/app-link";

export const MESSAGING_RATE_LIMITS_DOCS_PATH = "/docs/messaging-rate-limits";

export function useClassifyMediaLoadError() {
  const t = useTranslations();
  const locale = useLocale();

  return async (src: string): Promise<"rateLimited" | "unavailable" | "transient"> => {
    try {
      const res = await fetch(src, { method: "HEAD" });

      if (res.status === 429) {
        const retryAfter = formatRetryAfter(locale, Number(res.headers.get("retry-after")) || null);
        toast.error(t("Inbox.rateLimited", { retryAfter }), {
          id: "media-rate-limited",
          action: {
            label: t("Inbox.learnMore"),
            onClick: () => {
              const docsHref = localizedContentHref(MESSAGING_RATE_LIMITS_DOCS_PATH, locale);
              if (docsHref) window.open(docsHref, "_blank", "noopener,noreferrer");
            },
          },
        });
        return "rateLimited";
      }

      return res.ok ? "transient" : "unavailable";
    } catch {
      return "transient";
    }
  };
}

type Props = {
  src: string;
  className?: string;
  children: (onLoaded: () => void, onFailed: () => void) => ReactNode;
};

export function LazyMedia({ src, className, children }: Props) {
  const t = useTranslations();
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [state, setState] = useState<"loading" | "loaded" | "failed" | "unavailable">("loading");
  const [attempt, setAttempt] = useState(0);
  const classifyLoadError = useClassifyMediaLoadError();

  const onFailed = () => {
    setState("failed");
    void classifyLoadError(src)
      .then((kind) => {
        if (kind === "unavailable") setState("unavailable");
      })
      .catch(reportApplicationError);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("relative", state !== "loaded" && "min-h-40 min-w-44", className)}>
      {inView && state !== "failed" && state !== "unavailable" && (
        <span key={attempt} className="contents">
          {children(() => setState("loaded"), onFailed)}
        </span>
      )}

      {state === "loading" && (
        <div className="bg-placeholder absolute inset-0 flex items-center justify-center">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      )}

      {state === "failed" && (
        <button
          className="bg-placeholder hover:bg-placeholder absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1.5 transition-colors active:scale-[0.97]"
          type="button"
          onClick={() => {
            setAttempt((n) => n + 1);
            setState("loading");
          }}
        >
          <RotateCw className="text-muted-foreground size-5" />

          <span className="text-muted-foreground text-[11px]">{t("Inbox.loadMedia")}</span>
        </button>
      )}

      {state === "unavailable" && (
        <div className="bg-placeholder absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <Ban className="text-muted-foreground size-5" />

          <span className="text-muted-foreground text-[11px]">{t("Inbox.mediaUnavailable")}</span>
        </div>
      )}
    </div>
  );
}
