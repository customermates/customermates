import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { EmailFolderSchema } from "./email-folders";

import {
  ConnectedAccountStatus,
  MessagingProvider,
  MessagingMessageDirection,
  MessagingMessageOrigin,
  MessagingThreadState,
  MessagingThreadType,
} from "@/generated/prisma";

import { PreviewKindSchema } from "./attachment-kind";
import { ContactReferenceSchema } from "@/core/base/base-entity.schema";

export const MessagingProviderSchema = z.enum(MessagingProvider);

const ConnectedAccountOwnerSchema = z.object({
  userId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
});

export const ConnectedAccountDtoSchema = z.object({
  id: z.uuid(),
  provider: MessagingProviderSchema,
  status: z.enum(ConnectedAccountStatus),
  hasMessaging: z.boolean(),
  hasCalendar: z.boolean(),
  emailAddress: z.string().nullable(),
  displayName: z.string().nullable(),
  shared: z.boolean(),
  syncing: z.boolean(),
  preparing: z.boolean(),
  lastSyncedAt: z.date().nullable(),
  createdAt: z.date(),
  owner: ConnectedAccountOwnerSchema,
  isOwner: z.boolean(),
  folders: z.array(EmailFolderSchema).default([]),
  selectedFolderIds: z.array(z.string()).default([]),
  foldersSyncedAt: z.date().nullable(),
  linkedinProducts: z.array(z.string()).default([]),
});
export type ConnectedAccountDto = Data<typeof ConnectedAccountDtoSchema>;

export const MessagingAttendeeSchema = z.object({
  attendeeId: z.string(),
  displayName: z.string().nullable(),
  identifier: z.string(),
  pictureUrl: z.string().nullish(),
  profileUrl: z.string().nullish(),
  headline: z.string().nullish(),
  occupation: z.string().nullish(),
  isSelf: z.boolean().optional(),
  contact: ContactReferenceSchema.nullish(),
});
export type MessagingAttendee = z.infer<typeof MessagingAttendeeSchema>;

export const AttachmentMetaSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  fileName: z.string().nullish(),
  type: z.string().nullish(),
  mime: z.string().nullish(),
  url: z.string().nullish(),
  size: z.number().int().nonnegative().nullish(),
  sticker: z.boolean().nullish(),
  voiceNote: z.boolean().nullish(),
  gif: z.boolean().nullish(),
  durationSeconds: z.number().nonnegative().nullish(),
  unavailable: z.boolean().nullish(),
});
export type AttachmentMeta = z.infer<typeof AttachmentMetaSchema>;

export const MessagingThreadStateSchema = z.enum(MessagingThreadState);
export type { MessagingThreadState };

export const MessagingThreadSchema = z.object({
  id: z.uuid(),
  connectedAccountId: z.uuid(),
  unipileThreadId: z.string(),
  provider: MessagingProviderSchema,
  type: z.enum(MessagingThreadType).default("single"),
  name: z.string().nullable().default(null),
  subject: z.string().nullable(),
  preview: z.string().nullable(),
  previewKind: PreviewKindSchema.nullable(),
  lastMessageAt: z.date().nullable(),
  participants: z.array(MessagingAttendeeSchema),
  state: MessagingThreadStateSchema.default("unread"),
  sharedToCrm: z.boolean().default(false),
  accountShared: z.boolean().default(false),
  isOwner: z.boolean().default(false),
  lastMessageFromSelf: z.boolean().default(false),
  lastMessageSenderName: z.string().nullable().default(null),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type MessagingThread = Data<typeof MessagingThreadSchema>;

export const MessageReactionEntrySchema = z.object({
  value: z.string(),
  attendeeId: z.string(),
  attendeeDisplayName: z.string().nullable(),
  isSelf: z.boolean(),
});
export type MessageReactionEntry = z.infer<typeof MessageReactionEntrySchema>;

export const MessagingMessageSchema = z.object({
  id: z.uuid(),
  messagingThreadId: z.uuid(),
  connectedAccountId: z.uuid(),
  unipileMessageId: z.string(),
  providerMessageId: z.string().nullish(),
  provider: MessagingProviderSchema,
  direction: z.enum(MessagingMessageDirection),
  origin: z.enum(MessagingMessageOrigin),
  sender: MessagingAttendeeSchema,
  recipients: z.object({
    to: z.array(MessagingAttendeeSchema).default([]),
    cc: z.array(MessagingAttendeeSchema).default([]),
    bcc: z.array(MessagingAttendeeSchema).default([]),
  }),
  subject: z.string().nullable(),
  bodyText: z.string().nullable(),
  bodyHtml: z.string().nullable(),
  attachmentsMeta: z.array(AttachmentMetaSchema),
  folderIds: z.array(z.string()).default([]),
  isEvent: z.boolean().default(false),
  isDeleted: z.boolean().default(false),
  isHidden: z.boolean().default(false),
  isDraft: z.boolean().default(false),
  sentAt: z.date(),
  editedAt: z.date().nullable(),
  reactions: z.array(MessageReactionEntrySchema).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type MessagingMessage = Data<typeof MessagingMessageSchema>;

export type IngestMessage = Pick<
  MessagingMessage,
  | "unipileMessageId"
  | "providerMessageId"
  | "provider"
  | "direction"
  | "origin"
  | "sender"
  | "recipients"
  | "subject"
  | "bodyText"
  | "bodyHtml"
  | "attachmentsMeta"
  | "isEvent"
  | "isDeleted"
  | "isHidden"
  | "sentAt"
  | "reactions"
> & {
  unipileThreadId: string;
  threadType?: MessagingThreadType;
  folderIds?: string[];
  editedAt?: Date | null;
};
