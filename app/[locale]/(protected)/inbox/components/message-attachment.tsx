"use client";

import { Ban, ExternalLink } from "lucide-react";

import { Icon } from "@/components/shared/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import {
  type AttachmentMeta,
  type InboxT,
  attachmentProxyUrl,
  attachmentRowClass,
  attachmentSubtitle,
  classifyAttachment,
  describeFile,
} from "./attachment-classify";
import { AttachmentRow } from "./attachment-row";
import { LazyMedia } from "./lazy-media";
import { VoiceMessage } from "./voice-message";

type Props = {
  messageId: string;
  att: AttachmentMeta;
  t: InboxT;
};

export function MessageAttachment({ messageId, att, t }: Props) {
  const kind = classifyAttachment(att);
  const proxyUrl = attachmentProxyUrl(messageId, att.id);

  if (att.unavailable) {
    return (
      <span className={attachmentRowClass(false, "opacity-70")}>
        <Icon className="text-muted-foreground size-5 shrink-0" icon={Ban} />

        <span className="truncate">{t("Inbox.attachmentUnavailable")}</span>
      </span>
    );
  }

  if (kind === "post" && att.linkUrl) {
    return (
      <a className={attachmentRowClass(true)} href={att.linkUrl} rel="noreferrer noopener" target="_blank">
        <Icon className="text-muted-foreground size-5 shrink-0" icon={ExternalLink} />

        <span className="truncate">{t("Inbox.attachmentLinkedinPost")}</span>
      </a>
    );
  }

  if (kind === "unsupported") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={attachmentRowClass(false, "opacity-80")}>
            <Icon className="text-muted-foreground size-5 shrink-0" icon={Ban} />

            <span className="truncate">{t("Inbox.attachmentUnknown")}</span>
          </span>
        </TooltipTrigger>

        <TooltipContent className="max-w-xs">{t("Inbox.attachmentUnsupported")}</TooltipContent>
      </Tooltip>
    );
  }

  if (kind === "file") {
    const { Icon: FileTypeIcon, accent } = describeFile(att);
    const name = att.fileName?.trim() || att.name?.trim() || t("Inbox.attachmentFile");
    return (
      <AttachmentRow
        accent={accent}
        download={att.fileName ?? undefined}
        fileIcon={FileTypeIcon}
        href={proxyUrl}
        name={name}
        subtitle={attachmentSubtitle(t, att)}
      />
    );
  }

  if (kind === "sticker") {
    return (
      <LazyMedia className="min-h-32 min-w-32 max-h-32 max-w-48" src={proxyUrl}>
        {(onLoaded, onFailed) => (
          // eslint-disable-next-line @next/next/no-img-element -- proxy-streamed sticker, not a static asset for next/image
          <img
            alt={t("Inbox.attachmentSticker")}
            className="max-h-32 max-w-48 object-contain"
            src={proxyUrl}
            onError={onFailed}
            onLoad={onLoaded}
          />
        )}
      </LazyMedia>
    );
  }

  if (kind === "image" || kind === "gif") {
    const label = kind === "gif" ? "GIF" : t("Inbox.attachmentImage");
    const isVideoPayload = att.mime?.toLowerCase().startsWith("video/") ?? false;

    return (
      <LazyMedia className="max-h-72 max-w-full" src={proxyUrl}>
        {(onLoaded, onFailed) =>
          isVideoPayload ? (
            <video
              autoPlay
              loop
              muted
              playsInline
              aria-label={label}
              className="max-h-72 max-w-full object-contain"
              preload="metadata"
              src={proxyUrl}
              onError={onFailed}
              onLoadedData={onLoaded}
            >
              <track kind="captions" />
            </video>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- proxy-streamed attachment, not a static asset for next/image
            <img
              alt={label}
              className="max-h-72 max-w-full object-contain"
              src={proxyUrl}
              onError={onFailed}
              onLoad={onLoaded}
            />
          )
        }
      </LazyMedia>
    );
  }

  if (kind === "video") {
    return (
      <LazyMedia className="max-h-72 max-w-full" src={proxyUrl}>
        {(onLoaded, onFailed) => (
          <video
            controls
            className="max-h-72 max-w-full"
            preload="metadata"
            src={proxyUrl}
            onError={onFailed}
            onLoadedData={onLoaded}
          >
            <track kind="captions" />
          </video>
        )}
      </LazyMedia>
    );
  }

  return <VoiceMessage durationSeconds={att.durationSeconds} src={proxyUrl} />;
}
