import { BaseRepository } from "@/core/base/base-repository";
import { getMessagingRepo } from "@/core/di";

export class PrismaContactAvatarRepo extends BaseRepository {
  async recomputeContactAvatar(args: { contactId: string; companyId: string }) {
    const { contactId, companyId } = args;

    await this.runAfterCommit(async () => {
      const identifier = await this.prisma.contactIdentifier.findFirst({
        where: { companyId, contactId, pictureUrl: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { pictureUrl: true },
      });

      const participantPictureUrl = identifier
        ? null
        : await getMessagingRepo().findParticipantPictureUrl({ companyId, contactId });

      await this.prisma.contact.updateMany({
        where: { id: contactId, companyId },
        data: {
          avatarUrl: identifier?.pictureUrl ?? participantPictureUrl ?? null,
        },
      });
    });
  }
}
