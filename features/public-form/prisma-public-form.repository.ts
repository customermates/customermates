import type {
  NewPublicFormSubmission,
  PublicFormCreate,
  PublicFormPatch,
  PublicFormRepo,
  StoredPublicForm,
} from "./public-form.repo";
import type { PublicFormLookup, PublicFormLookupRepo } from "./public-form-lookup.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";

const FORM_SELECT = {
  id: true,
  typeId: true,
  name: true,
  createdById: true,
  enabled: true,
  config: true,
  consentVersion: true,
  submissionCount: true,
  lastSubmittedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class PrismaPublicFormRepo extends TenantRepository implements PublicFormRepo, PublicFormLookupRepo {
  findForm(id: string): Promise<StoredPublicForm | null> {
    return this.prisma.publicForm.findFirst({ where: { id, companyId: this.companyId }, select: FORM_SELECT });
  }

  findFormOfType(typeId: string): Promise<StoredPublicForm | null> {
    return this.prisma.publicForm.findFirst({ where: { typeId, companyId: this.companyId }, select: FORM_SELECT });
  }

  listForms(typeId?: string): Promise<StoredPublicForm[]> {
    return this.prisma.publicForm.findMany({
      where: { companyId: this.companyId, ...(typeId ? { typeId } : {}) },
      select: FORM_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  createForm(data: PublicFormCreate): Promise<StoredPublicForm> {
    return this.prisma.publicForm.create({
      data: {
        companyId: this.companyId,
        typeId: data.typeId,
        name: data.name,
        enabled: data.enabled,
        config: data.config,
        createdById: this.userId,
      },
      select: FORM_SELECT,
    });
  }

  updateForm(id: string, patch: PublicFormPatch): Promise<StoredPublicForm> {
    return this.prisma.publicForm.update({
      where: { id, companyId: this.companyId },
      data: {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.enabled === undefined ? {} : patch.enabled ? { enabled: true, createdById: this.userId } : { enabled: false }),
        ...(patch.config === undefined ? {} : { config: patch.config }),
        ...(patch.consentVersion === undefined ? {} : { consentVersion: patch.consentVersion }),
      },
      select: FORM_SELECT,
    });
  }

  countSubmissionsSince(since: Date): Promise<number> {
    return this.prisma.publicFormSubmission.count({
      where: { companyId: this.companyId, createdAt: { gte: since } },
    });
  }

  countFormSubmissionsSince(formId: string, since: Date, ipHash?: string): Promise<number> {
    return this.prisma.publicFormSubmission.count({
      where: { companyId: this.companyId, formId, createdAt: { gte: since }, ...(ipHash ? { ipHash } : {}) },
    });
  }

  @Transaction
  async recordSubmission(submission: NewPublicFormSubmission): Promise<{ id: string }> {
    const created = await this.prisma.publicFormSubmission.create({
      data: {
        id: submission.id,
        companyId: this.companyId,
        formId: submission.formId,
        outcome: submission.outcome,
        recordId: submission.recordId,
        personRecordId: submission.personRecordId,
        ipHash: submission.ipHash,
        locale: submission.locale,
        consentText: submission.consent?.text ?? null,
        consentVersion: submission.consent?.version ?? null,
        consentedAt: submission.consent?.at ?? null,
      },
      select: { id: true },
    });
    await this.prisma.publicForm.update({
      where: { id: submission.formId, companyId: this.companyId },
      data: { submissionCount: { increment: 1 }, lastSubmittedAt: new Date() },
    });
    return created;
  }

  async publicLinksAllowed(): Promise<boolean> {
    const company = await this.prisma.company.findUnique({
      where: { id: this.companyId },
      select: { allowPublicLinks: true },
    });
    return company?.allowPublicLinks === true;
  }

  @BypassTenantGuard
  findFormUnscoped(formId: string): Promise<PublicFormLookup | null> {
    return this.prisma.publicForm.findUnique({
      where: { id: formId },
      select: {
        ...FORM_SELECT,
        companyId: true,
        company: { select: { name: true, allowPublicLinks: true, deletingAt: true } },
        type: { select: { archived: true } },
      },
    });
  }
}
