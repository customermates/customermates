export abstract class CreateAuditLogRepo {
  abstract log(data: { event: string; eventData: Record<string, unknown>; entityId: string }): Promise<void>;
  abstract logUnscoped(data: {
    event: string;
    eventData: Record<string, unknown>;
    entityId: string;
    userId: string;
    companyId: string;
  }): Promise<void>;
}
