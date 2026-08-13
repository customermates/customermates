const INLINE_FIELD_LIMIT = 3;

export type MessageSubtitleModel =
  | { kind: "prefixedPreview"; prefix: string; preview: string }
  | { kind: "preview"; preview: string }
  | { kind: "attachmentKind"; label: string }
  | { kind: "unsupported" };

export type MessageSubtitleInput = {
  preview: string | null;
  isGroup: boolean;
  senderIsMine: boolean;
  senderName: string;
  youPrefix: string;
  attachmentKindLabel: string | null;
};

export function formatFieldList(fields: string[]): string {
  if (fields.length === 0) return "";

  const visible = fields.slice(0, INLINE_FIELD_LIMIT);
  const overflow = fields.length - visible.length;

  return overflow > 0 ? `${visible.join(" · ")} +${overflow}` : visible.join(" · ");
}

export function resolveMessagePreview(rawPreview: string | null, isUnsupportedBody: boolean): string | null {
  return rawPreview && !isUnsupportedBody ? rawPreview : null;
}

export function buildMessageSubtitle(input: MessageSubtitleInput): MessageSubtitleModel {
  const { preview, isGroup, senderIsMine, senderName, youPrefix, attachmentKindLabel } = input;

  if (preview && isGroup)
    return { kind: "prefixedPreview", prefix: senderIsMine ? youPrefix : `${senderName}:`, preview };

  if (preview) return { kind: "preview", preview };

  if (attachmentKindLabel) return { kind: "attachmentKind", label: attachmentKindLabel };

  return { kind: "unsupported" };
}

export function resolveMessageSenderName(
  senderLabel: string | null | undefined,
  senderIsMine: boolean,
  youLabel: string,
  unknownLabel: string,
): string {
  return senderLabel || (senderIsMine ? youLabel : unknownLabel);
}

export function resolveMessageTitle(
  isGroup: boolean,
  threadLabel: string | null | undefined,
  senderName: string,
): string {
  return isGroup ? threadLabel?.trim() || senderName : senderName;
}

export function resolveActorName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string,
): string {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim() || email;
}

export function buildCalendarSubtitle(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}
