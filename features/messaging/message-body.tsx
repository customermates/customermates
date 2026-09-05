"use client";

import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { EmailFrame } from "./email-frame";
import { MessageText } from "./message-text";
import { SanitizedHtml } from "@/components/shared/sanitized-html";
import { cn } from "@/core/utils/cn";
import { isPlainTextEmailBody, splitQuotedText } from "@/ee/messaging/email-quote";
import { isEmailProvider } from "@/ee/messaging/provider";
import { isUnipileUnsupportedBody } from "@/ee/messaging/thread-display";

type Props = {
  message: Pick<MessagingMessageDto, "provider" | "bodyText" | "bodyHtml" | "isDeleted" | "subject">;
  emailHtml?: string;
  showRemoteImages?: boolean;
  hasSupplementaryContent?: boolean;
  fullBleedMedia?: boolean;
};

export function hasLoadableRemoteImages(html: string): boolean {
  if (!html) return false;
  if (/url\(\s*["']?https?:/i.test(html)) return true;

  return (html.match(/<img\b[^>]*>/gi) ?? []).some((tag) => {
    if (!/\bsrc\s*=\s*["']https?:/i.test(tag)) return false;

    const width = tag.match(/\bwidth\s*=\s*["']?(\d+)/i);
    const height = tag.match(/\bheight\s*=\s*["']?(\d+)/i);
    const tiny =
      (width ? Number(width[1]) <= 2 : false) ||
      (height ? Number(height[1]) <= 2 : false) ||
      /(?:width|height)\s*:\s*[012](?:px)?\b/i.test(tag);
    const hidden = /display\s*:\s*none|visibility\s*:\s*hidden/i.test(tag);

    return !tiny && !hidden;
  });
}

function TextWithQuote({ visible, quoted, onPaper }: { visible: string; quoted: string | null; onPaper?: boolean }) {
  const t = useTranslations();
  const [showQuoted, setShowQuoted] = useState(false);

  return (
    <>
      <MessageText text={visible} />

      {quoted && (
        <>
          <button
            className={cn(
              "mt-1 text-xs underline underline-offset-2",
              onPaper ? "text-neutral-500 hover:text-neutral-800" : "text-muted-foreground hover:text-foreground",
            )}
            type="button"
            onClick={() => setShowQuoted((prev) => !prev)}
          >
            {showQuoted ? t("Inbox.hideQuotedText") : t("Inbox.showQuotedText")}
          </button>

          {showQuoted && (
            <div
              className={cn(
                "mt-1 border-l-2 pl-2",
                onPaper ? "border-neutral-300 text-neutral-500" : "border-border text-muted-foreground",
              )}
            >
              <MessageText text={quoted} />
            </div>
          )}
        </>
      )}
    </>
  );
}

export const MessageBody = observer(function MessageBody({
  message,
  emailHtml = message.bodyHtml ?? "",
  showRemoteImages = false,
  hasSupplementaryContent = false,
  fullBleedMedia = false,
}: Props) {
  const t = useTranslations();
  if (message.isDeleted)
    return <div className="text-muted-foreground px-3.5 py-2 italic">{t("Inbox.messageDeleted")}</div>;

  const providerIsEmail = isEmailProvider(message.provider);
  const isEmail = providerIsEmail && Boolean(emailHtml);
  const emailPlainBody = isEmail && isPlainTextEmailBody(emailHtml) ? emailHtml : null;
  const inlineHtml = !isEmail ? message.bodyHtml : null;
  const rawDisplayText = isUnipileUnsupportedBody(message.bodyText) ? null : message.bodyText;
  const quoteSource = isEmail ? emailPlainBody : providerIsEmail ? rawDisplayText : null;
  const quoteSplit = quoteSource ? splitQuotedText(quoteSource) : { visible: "", quoted: null };
  const displayText = !isEmail && quoteSource ? quoteSplit.visible : rawDisplayText;
  const chatSubject = !isEmail && message.provider === "linkedin" ? message.subject?.trim() || null : null;

  if (isEmail) {
    return emailPlainBody ? (
      <div className="bg-white px-4 py-3 leading-normal text-neutral-900 wrap-anywhere">
        <TextWithQuote quoted={quoteSplit.quoted} visible={quoteSplit.visible} onPaper />
      </div>
    ) : (
      <EmailFrame html={emailHtml} showRemoteImages={showRemoteImages} />
    );
  }

  if (inlineHtml || displayText || chatSubject) {
    return (
      <div className={cn("px-3.5 pt-2 pb-1 leading-relaxed wrap-anywhere", fullBleedMedia && "w-min min-w-full")}>
        {chatSubject && <div className="pb-0.5 font-medium">{chatSubject}</div>}

        {inlineHtml ? (
          <SanitizedHtml className="prose-sm max-w-none wrap-anywhere [&_a]:underline" html={inlineHtml} />
        ) : displayText ? (
          <TextWithQuote quoted={quoteSplit.quoted} visible={displayText} />
        ) : null}
      </div>
    );
  }

  return hasSupplementaryContent ? null : (
    <div className="text-muted-foreground px-3.5 py-2 italic">{t("Inbox.attachmentUnsupported")}</div>
  );
});
