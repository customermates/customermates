"use client";

import { cn } from "@/lib/utils";

import type { InboxT } from "./attachment-classify";

type Props = {
  isOutbound: boolean;
  showLoadMedia: boolean;
  showLoadImages: boolean;
  onLoadMedia: () => void;
  onLoadImages: () => void;
  t: InboxT;
};

export function MessageActions({ isOutbound, showLoadMedia, showLoadImages, onLoadMedia, onLoadImages, t }: Props) {
  if (!showLoadMedia && !showLoadImages) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-3 text-xs", isOutbound ? "justify-end" : "justify-start")}>
      {showLoadMedia && (
        <button
          className="text-primary font-medium underline-offset-2 hover:underline"
          type="button"
          onClick={onLoadMedia}
        >
          {t("Inbox.loadMedia")}
        </button>
      )}

      {showLoadImages && (
        <button
          className="text-primary font-medium underline-offset-2 hover:underline"
          type="button"
          onClick={onLoadImages}
        >
          {t("Inbox.compose.loadRemoteImages")}
        </button>
      )}
    </div>
  );
}
