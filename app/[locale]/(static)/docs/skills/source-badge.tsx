"use client";

import { useEffect, useMemo, useState } from "react";
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { Link } from "@heroui/link";

import { XIcon } from "@/components/x-icon";

type Props = {
  sourceUrl: string;
  className?: string;
  useAnchor?: boolean;
};

export function SourceBadge({ sourceUrl, className, useAnchor = true }: Props) {
  const [faviconLoadFailed, setFaviconLoadFailed] = useState(false);

  const faviconUrl = useMemo(() => {
    try {
      const parsed = new URL(sourceUrl);
      return `${parsed.origin}/favicon.ico`;
    } catch {
      return null;
    }
  }, [sourceUrl]);

  const sourceLabel = useMemo(() => {
    try {
      const hostname = new URL(sourceUrl).hostname;
      return hostname.replace(/^www\./, "");
    } catch {
      return sourceUrl;
    }
  }, [sourceUrl]);

  useEffect(() => {
    setFaviconLoadFailed(false);
  }, [faviconUrl]);

  const content = (
    <>
      {faviconUrl && !faviconLoadFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={sourceLabel}
          className="h-3.5 w-3.5 rounded-xs dark:brightness-0 dark:invert"
          decoding="async"
          loading="lazy"
          src={faviconUrl}
          onError={() => setFaviconLoadFailed(true)}
        />
      ) : (
        <XIcon icon={GlobeAltIcon} size="sm" />
      )}

      <span className="truncate max-w-full">{sourceLabel}</span>
    </>
  );

  if (!useAnchor)
    return <div className={className ?? "inline-flex items-center gap-1.5 text-xs text-subdued"}>{content}</div>;

  return (
    <Link
      className={className ?? "inline-flex items-center gap-1.5 text-xs text-subdued"}
      color="foreground"
      href={sourceUrl}
      rel="noopener noreferrer"
      target="_blank"
      onClick={(e) => e.stopPropagation()}
    >
      {content}
    </Link>
  );
}
