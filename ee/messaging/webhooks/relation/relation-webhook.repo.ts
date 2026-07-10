export abstract class WebhookActivityRepo {
  abstract recordLinkedinConnectionAcceptedUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    providerUserId: string;
    fullName: string | null;
    headline: string | null;
    profileUrl: string | null;
    pictureUrl: string | null;
    occurredAt: Date;
  }): Promise<{ id: string }>;
}
