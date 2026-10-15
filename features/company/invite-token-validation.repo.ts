export abstract class InviteTokenRepo {
  abstract findTokenUnscoped(token: string): Promise<{
    companyId: string;
    company: { name: string | null };
    createdBy: { email: string; firstName: string; lastName: string };
    expiresAt: Date;
  } | null>;
}
