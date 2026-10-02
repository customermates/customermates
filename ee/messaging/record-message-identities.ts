import type { MessagingMessage, MessagingAttendee } from "./messaging.schema";
import type { RecordIdentityReader } from "@/features/records/record-identity-reader";

export async function hydrateMessageRecordIdentities(
  messages: MessagingMessage[],
  reader: Pick<RecordIdentityReader, "resolve">,
): Promise<void> {
  const attendees = messages.flatMap((message) => {
    if (message.direction === "inbound") message.recipients.bcc = [];
    return [message.sender, ...message.recipients.to, ...message.recipients.cc, ...message.recipients.bcc].map(
      (attendee) => ({ attendee, provider: message.provider }),
    );
  });
  const pairs = [
    ...new Map(
      attendees
        .filter(({ attendee }) => attendee.identifier.trim())
        .map(({ attendee, provider }) => [
          JSON.stringify([provider, attendee.identifier.trim()]),
          { provider, value: attendee.identifier.trim() },
        ]),
    ).values(),
  ];
  const matches = new Map(
    (await reader.resolve(pairs)).map((match) => [JSON.stringify([match.provider, match.value]), match.records]),
  );
  for (const { attendee, provider } of attendees) {
    delete (attendee as MessagingAttendee & { contact?: unknown }).contact;
    delete (attendee as MessagingAttendee & { record?: unknown }).record;
    attendee.records = matches.get(JSON.stringify([provider, attendee.identifier.trim()])) ?? [];
  }
}
