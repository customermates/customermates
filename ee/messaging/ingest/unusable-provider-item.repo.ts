export abstract class UnusableProviderItemRepo {
  abstract recordUnusableItemUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    payload: unknown;
    unipileMessageId?: string | null;
  }): Promise<void>;
}
