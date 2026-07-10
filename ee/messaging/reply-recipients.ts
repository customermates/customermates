import type { MessagingAttendee } from "./messaging.schema";

type ReplyMessage = {
  direction: string;
  isDraft: boolean;
  sender: MessagingAttendee;
  recipients: { to: MessagingAttendee[]; cc: MessagingAttendee[]; bcc: MessagingAttendee[] };
};

export function deriveReplyRecipients(
  participants: MessagingAttendee[],
  messages: ReplyMessage[],
): { to: string[]; cc: string[] } {
  const self = new Set<string>();
  for (const p of participants) if (p.isSelf && p.identifier) self.add(p.identifier);
  for (const m of messages) {
    if (m.sender.isSelf && m.sender.identifier) self.add(m.sender.identifier);
    for (const r of [...m.recipients.to, ...m.recipients.cc, ...m.recipients.bcc])
      if (r.isSelf && r.identifier) self.add(r.identifier);
  }

  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound" && !m.isDraft);

  if (lastInbound) {
    const to = new Set<string>();
    if (lastInbound.sender.identifier && !self.has(lastInbound.sender.identifier))
      to.add(lastInbound.sender.identifier);
    for (const r of lastInbound.recipients.to) if (r.identifier && !self.has(r.identifier)) to.add(r.identifier);
    if (to.size === 0 && lastInbound.sender.identifier) to.add(lastInbound.sender.identifier);

    const cc = new Set<string>();
    for (const r of lastInbound.recipients.cc)
      if (r.identifier && !self.has(r.identifier) && !to.has(r.identifier)) cc.add(r.identifier);

    return { to: [...to], cc: [...cc] };
  }

  const to = new Set<string>();
  for (const p of participants) if (p.identifier && !p.isSelf && !self.has(p.identifier)) to.add(p.identifier);
  if (to.size === 0) for (const p of participants) if (p.identifier) to.add(p.identifier);

  return { to: [...to], cc: [] };
}
