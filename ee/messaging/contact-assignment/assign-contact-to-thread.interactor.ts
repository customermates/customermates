import type { MessagingProvider } from "@/generated/prisma";

import type { MessagingAttendee, MessagingThread } from "../messaging.schema";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = z.object({
  threadId: z.uuid(),
  identifier: z.string().min(1),
  contactId: z.uuid().nullable(),
});
export type AssignContactToThreadData = Data<typeof Schema>;

interface ContactIdentifierUpsert {
  provider: MessagingProvider;
  value: string;
  displayName?: string | null;
  pictureUrl?: string | null;
  profileUrl?: string | null;
  headline?: string | null;
  occupation?: string | null;
}

type ContactCore = {
  id: string;
  firstName: string;
  lastName: string;
};

export abstract class AssignContactToThreadRepo {
  abstract findThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
}

export abstract class AssignContactToThreadContactRepo {
  abstract findContactCoreByIdOrThrow(contactId: string): Promise<ContactCore>;
  abstract updateContactEnrichment(args: {
    contactId: string;
    firstName?: string;
    lastName?: string;
    identifierUpserts?: ContactIdentifierUpsert[];
  }): Promise<void>;
  abstract removeContactIdentifier(args: { provider: MessagingProvider; value: string }): Promise<void>;
}

function splitDisplayName(displayName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = displayName.trim().replace(/\s+/g, " ");

  if (!trimmed) return { firstName: "", lastName: "" };

  const parts = trimmed.split(" ");

  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };

  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

@TenantInteractor({ resource: Resource.contacts, action: Action.update })
export class AssignContactToThreadInteractor extends AuthenticatedInteractor<AssignContactToThreadData, null> {
  constructor(
    private repo: AssignContactToThreadRepo,
    private contactRepo: AssignContactToThreadContactRepo,
  ) {
    super();
  }

  @Enforce(Schema)
  @Transaction
  async invoke(data: AssignContactToThreadData): Promise<{ ok: true; data: null }> {
    const thread = await this.repo.findThreadByIdOrThrow(data.threadId);
    const participant = thread.participants.find((p) => p.identifier === data.identifier) ?? null;

    if (data.contactId) await this.linkParticipant(data.contactId, thread.provider, data.identifier, participant);
    else {
      await this.contactRepo.removeContactIdentifier({
        provider: thread.provider,
        value: data.identifier,
      });
    }

    return { ok: true as const, data: null };
  }

  private async linkParticipant(
    contactId: string,
    provider: MessagingProvider,
    identifier: string,
    participant: MessagingAttendee | null,
  ): Promise<void> {
    const contact = await this.contactRepo.findContactCoreByIdOrThrow(contactId);

    const nameUpdate: { firstName?: string; lastName?: string } = {};
    const hasFirstName = contact.firstName.trim().length > 0;
    const hasLastName = contact.lastName.trim().length > 0;
    const displayName = participant?.displayName?.trim();
    if ((!hasFirstName || !hasLastName) && displayName) {
      const split = splitDisplayName(displayName);
      if (!hasFirstName && split.firstName) nameUpdate.firstName = split.firstName;
      if (!hasLastName && split.lastName) nameUpdate.lastName = split.lastName;
    }

    await this.contactRepo.updateContactEnrichment({
      contactId,
      ...nameUpdate,
      identifierUpserts: [
        {
          provider,
          value: identifier,
          displayName: participant?.displayName ?? null,
          pictureUrl: participant?.pictureUrl ?? null,
          profileUrl: participant?.profileUrl ?? null,
          headline: participant?.headline ?? null,
          occupation: participant?.occupation ?? null,
        },
      ],
    });
  }
}
