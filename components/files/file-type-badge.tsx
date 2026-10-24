"use client";

import { useState } from "react";

import { cn } from "@/core/utils/cn";

import { FILE_KIND_ICON, FILE_KIND_TONE_CLASS, fileBadgeText, fileKind } from "./file-kind";

export type ImageSize = { width: number; height: number };

const SIZE_CLASS = {
  sm: "size-5 rounded-[5px] text-[7px]",
  md: "size-8 rounded-md text-[9px]",
};

export function FileTypeBadge({
  mimeType,
  name,
  size = "md",
  thumbnailSrc,
  onImageSize,
  className,
}: {
  mimeType: string | null | undefined;
  name: string | null | undefined;
  size?: keyof typeof SIZE_CLASS;
  thumbnailSrc?: string | null;
  onImageSize?: (size: ImageSize) => void;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const kind = fileKind(mimeType, name);
  const text = fileBadgeText(kind, name);
  const Icon = FILE_KIND_ICON[kind];
  if (kind === "image" && thumbnailSrc && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- authenticated file stream; an image proxy cannot forward the session
      <img
        alt=""
        className={cn("shrink-0 border bg-muted object-cover", SIZE_CLASS[size], className)}
        data-file-badge="image"
        decoding="async"
        loading="lazy"
        src={thumbnailSrc}
        onError={() => setFailed(true)}
        onLoad={(event) =>
          onImageSize?.({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
        }
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-semibold tracking-tight select-none",
        SIZE_CLASS[size],
        FILE_KIND_TONE_CLASS[kind],
        className,
      )}
      data-file-badge={kind}
    >
      {text && size === "md" ? text : <Icon className={size === "md" ? "size-4" : "size-3"} />}
    </span>
  );
}
