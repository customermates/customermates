import type { LegalAuditRecord } from "./legal-audit.schema";

export abstract class LegalAuditRepo {
  abstract findLegalEventsUnscoped(companyId: string): Promise<LegalAuditRecord[]>;
}
