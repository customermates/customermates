import type { MessagingProvider } from "@/generated/prisma";

export abstract class ContactIdentifierOwnersRepo {
  abstract findIdentifierOwnersCompanyWide(
    pairs: { provider: MessagingProvider; value: string }[],
  ): Promise<Map<string, string>>;
}
