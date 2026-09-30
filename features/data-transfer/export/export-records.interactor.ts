import type { z } from "zod";

import type { RecordRepo, StoredRecord } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordDto, RecordRef } from "@/features/records/record-model.schema";
import type { RecordExport, RecordExportLink } from "@/features/data-transfer/record-transfer.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail, failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordDto } from "@/features/records/query-records.interactor";
import { RECORD_EXPORT_LIMIT, RECORD_EXPORT_LINK_LIMIT } from "@/features/data-transfer/record-transfer.schema";
import { RecordQuerySchema } from "@/features/records/record-query.schema";
import { invalidRecordQueryPart } from "@/features/records/record-query-validation";

const PAGE_SIZE = 250;

export const ExportRecordsSchema = RecordQuerySchema.pick({
  typeId: true,
  search: true,
  filters: true,
  relatedFilters: true,
  relationships: true,
  sort: true,
});
export type ExportRecordsInput = z.infer<typeof ExportRecordsSchema>;

@AllowInDemoMode
@TenantInteractor()
export class ExportRecordsInteractor extends AuthenticatedInteractor<ExportRecordsInput, RecordExport> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(ExportRecordsSchema)
  async invoke(input: ExportRecordsInput): Validated<RecordExport> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const type = model.types.find((item) => item.id === input.typeId && !item.archived);
        if (!type || (!policy.allowed(type.id, "readAll") && !policy.allowed(type.id, "readOwn")))
          return failNotFound(CustomErrorCode.recordTypeNotFound);

        const query = RecordQuerySchema.parse({ ...input, page: 1, pageSize: PAGE_SIZE });
        const invalid = invalidRecordQueryPart(query, model);
        if (invalid) return fail(CustomErrorCode.recordValueInvalid, [invalid]);
        const access = policy.access(model.types.filter((item) => !item.archived).map((item) => item.id));
        const records: RecordDto[] = [];
        const links: RecordExportLink[] = [];
        let processedLinkCount = 0;
        const checkedTargets = new Map<string, boolean>();
        const appendPage = async (
          pageTypeId: string,
          pageRows: StoredRecord[],
          visibleFields: Map<string, Set<string>>,
        ) => {
          if (records.length + pageRows.length > RECORD_EXPORT_LIMIT) return false;
          const identities = model.capabilities.some(
            (binding) => binding.kind === "personIdentity" && binding.typeId === pageTypeId,
          )
            ? await this.records.getRecordIdentitiesCompanyWide(
                pageTypeId,
                pageRows.map((record) => record.id),
              )
            : null;
          for (const row of pageRows) {
            records.push({
              ...recordDto(row, model, visibleFields.get(row.id) ?? new Set(), policy.memberScope),
              ...(identities ? { identities: identities.get(row.id) ?? [] } : {}),
            });
          }
          const candidateLinks = await this.records.getOutgoingLinksCompanyWide(
            pageTypeId,
            pageRows.map((record) => record.id),
            RECORD_EXPORT_LINK_LIMIT - processedLinkCount + 1,
          );
          processedLinkCount += candidateLinks.length;
          if (processedLinkCount > RECORD_EXPORT_LINK_LIMIT) return false;
          const targetRefs = new Map<string, RecordRef>(
            candidateLinks
              .filter((link) => !checkedTargets.has(`${link.target.typeId}:${link.target.recordId}`))
              .map((link) => [`${link.target.typeId}:${link.target.recordId}`, link.target] as const),
          );
          const targets = await this.records.getRecordsCompanyWide([...targetRefs.values()]);
          const targetsByKey = new Map(targets.map((target) => [`${target.typeId}:${target.id}`, target]));
          for (const link of candidateLinks) {
            const key = `${link.target.typeId}:${link.target.recordId}`;
            let readable = checkedTargets.get(key);
            if (readable === undefined) {
              const target = targetsByKey.get(key);
              readable = Boolean(target && (await policy.canRead(target)));
              checkedTargets.set(key, readable);
            }
            if (readable) links.push(link);
          }
          return true;
        };

        for (let page = 1; ; page += 1) {
          const result = await this.records.query({ ...query, page }, model, access, policy.memberScope);
          if (result.total > RECORD_EXPORT_LIMIT || !(await appendPage(type.id, result.records, result.visibleFields)))
            return fail(CustomErrorCode.recordCalculationBudget);
          if (records.length >= result.total || result.records.length === 0) break;
        }

        const visitedTypes = new Set([type.id]);
        let parentTypes = [type.id];
        while (parentTypes.length) {
          const nextTypes: string[] = [];
          for (const parentTypeId of parentTypes) {
            const parentIds = records.filter((row) => row.ref.typeId === parentTypeId).map((row) => row.ref.recordId);
            for (const childType of model.types.filter(
              (candidate) =>
                candidate.embedded &&
                !candidate.archived &&
                !visitedTypes.has(candidate.id) &&
                model.relationships.some(
                  (relation) =>
                    relation.id === candidate.parentRelationshipId &&
                    !relation.archived &&
                    relation.targetTypeId === parentTypeId,
                ),
            )) {
              visitedTypes.add(childType.id);
              nextTypes.push(childType.id);
              const parentRelationId = childType.parentRelationshipId;
              if (!parentIds.length || !parentRelationId) continue;
              for (let offset = 0; offset < parentIds.length; offset += 100) {
                let afterId: string | undefined;
                for (;;) {
                  const childRows = await this.records.getEmbeddedChildrenCompanyWide(
                    childType.id,
                    parentRelationId,
                    parentIds.slice(offset, offset + 100),
                    afterId,
                    PAGE_SIZE,
                  );
                  const visibleFields = await this.records.getVisibleFieldsCompanyWide(
                    childRows.map((row) => ({ typeId: row.typeId, recordId: row.id })),
                    model,
                    access,
                  );
                  if (!(await appendPage(childType.id, childRows, visibleFields)))
                    return fail(CustomErrorCode.recordCalculationBudget);
                  if (childRows.length < PAGE_SIZE) break;
                  const last = childRows.at(-1);
                  if (!last) break;
                  afterId = last.id;
                }
              }
            }
          }
          parentTypes = nextTypes;
        }

        return {
          ok: true as const,
          data: {
            format: "customermates-records" as const,
            version: 1 as const,
            typeId: type.id,
            schemaRevision: model.revision,
            exportedAt: new Date().toISOString(),
            records,
            links,
          },
        };
      },
      { readOnly: true, timeout: 120_000 },
    );
  }
}
