"use client";

import { Ban, Download, ExternalLink, Image as ImageIcon, Mic, Smile, Video } from "lucide-react";

import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

import {
  type AttachmentMeta,
  type InboxT,
  attachmentProxyUrl,
  bubbleClass,
  classifyAttachment,
  describeFile,
  formatBytes,
  formatDuration,
} from "./attachment-classify";

type Props = {
  messageId: string;
  att: AttachmentMeta;
  isOutbound: boolean;
  loaded: boolean;
  t: InboxT;
};

function metaClass(isOutbound: boolean): string {
  return cn("truncate text-[11px]", isOutbound ? "text-primary-foreground/70" : "text-muted-foreground");
}

function Placeholder({
  icon,
  label,
  meta,
  isOutbound,
}: {
  icon: typeof Video;
  label: string;
  meta?: string | null;
  isOutbound: boolean;
}) {
  return (
    <span className={bubbleClass(isOutbound)} title={label}>
      <Icon className="size-4 shrink-0" icon={icon} />

      <span className="flex min-w-0 flex-col">
        <span className="truncate">{label}</span>

        {meta ? <span className={metaClass(isOutbound)}>{meta}</span> : null}
      </span>
    </span>
  );
}

export function MessageAttachment({ messageId, att, isOutbound, loaded, t }: Props) {
  const kind = classifyAttachment(att);
  const proxyUrl = attachmentProxyUrl(messageId, att.id);
  const size = formatBytes(att.size);
  const duration = formatDuration(att.durationSeconds);

  if (att.unavailable) {
    return (
      <span className={bubbleClass(isOutbound, "opacity-70")} title={t("Inbox.attachmentUnavailable")}>
        <Icon className="size-4 shrink-0" icon={Ban} />

        <span className="truncate">{t("Inbox.attachmentUnavailable")}</span>
      </span>
    );
  }

  if (kind === "post" && att.linkUrl) {
    return (
      <a
        className={bubbleClass(isOutbound, "hover:underline")}
        href={att.linkUrl}
        rel="noreferrer noopener"
        target="_blank"
        title={t("Inbox.attachmentLinkedinPost")}
      >
        <Icon className="size-4 shrink-0" icon={ExternalLink} />

        <span className="truncate">{t("Inbox.attachmentLinkedinPost")}</span>
      </a>
    );
  }

  if (kind === "unsupported") {
    return (
      <span className={bubbleClass(isOutbound, "opacity-80")} title={t("Inbox.attachmentUnsupported")}>
        <Icon className="size-4 shrink-0" icon={Ban} />

        <span className="truncate">{t("Inbox.attachmentUnknown")}</span>
      </span>
    );
  }

  if (kind === "file") {
    const { Icon: FileTypeIcon, typeLabelKey, accent } = describeFile(att);
    const name = att.fileName?.trim() || att.name?.trim() || t("Inbox.attachmentFile");
    return (
      <a
        className={bubbleClass(isOutbound, "transition hover:brightness-110")}
        download={att.fileName ?? undefined}
        href={proxyUrl}
        rel="noreferrer"
        title={name}
      >
        <Icon className={cn("size-5 shrink-0", isOutbound ? "text-primary-foreground" : accent)} icon={FileTypeIcon} />

        <span className="flex min-w-0 flex-col">
          <span className="max-w-[15rem] truncate font-medium">{name}</span>

          <span className={metaClass(isOutbound)}>
            {t(typeLabelKey)}

            {size ? ` · ${size}` : ""}
          </span>
        </span>

        <Icon
          className={cn("size-4 shrink-0", isOutbound ? "text-primary-foreground/80" : "text-muted-foreground")}
          icon={Download}
        />
      </a>
    );
  }

  if (kind === "sticker") {
    if (!loaded) return <Placeholder icon={Smile} isOutbound={isOutbound} label={t("Inbox.attachmentSticker")} />;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- proxy-streamed sticker, not a static asset for next/image
      <img alt={t("Inbox.attachmentSticker")} className="max-h-32 max-w-48 object-contain" src={proxyUrl} />
    );
  }

  if (kind === "image" || kind === "gif") {
    const label = kind === "gif" ? "GIF" : t("Inbox.attachmentImage");
    if (!loaded) return <Placeholder icon={ImageIcon} isOutbound={isOutbound} label={label} meta={size} />;

    const isVideoPayload = att.type === "video" || (att.mime?.toLowerCase().startsWith("video/") ?? false);
    if (kind === "gif" && isVideoPayload) {
      return (
        <video
          autoPlay
          loop
          muted
          playsInline
          aria-label={label}
          className="border-border max-h-72 max-w-full rounded-md border object-contain"
          preload="metadata"
          src={proxyUrl}
        >
          <track kind="captions" />
        </video>
      );
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element -- proxy-streamed attachment, not a static asset for next/image
      <img alt={label} className="border-border max-h-72 max-w-full rounded-md border object-contain" src={proxyUrl} />
    );
  }

  if (kind === "video") {
    if (!loaded) {
      return (
        <Placeholder icon={Video} isOutbound={isOutbound} label={t("Inbox.attachmentVideo")} meta={duration ?? size} />
      );
    }
    return (
      <video controls className="border-border max-h-72 max-w-full rounded-md border" preload="metadata" src={proxyUrl}>
        <track kind="captions" />
      </video>
    );
  }

  // voice / audio
  const label = kind === "voice" ? t("Inbox.attachmentVoice") : t("Inbox.attachmentAudio");
  if (!loaded) return <Placeholder icon={Mic} isOutbound={isOutbound} label={label} meta={duration} />;
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- user voice/audio attachments have no caption track
    <audio controls className="max-w-full" preload="metadata" src={proxyUrl} />
  );
}
