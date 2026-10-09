import { recordChannelsEnabled } from "./record-channels";
import { z } from "zod";
import type { Action } from "@/generated/prisma";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordRepo, TrashReadOptions } from "./record.repo";
import type { RecordDto, RecordModelView } from "./record-model.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { liveRecordModel } from "./record-model-snapshot";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordWriteFailure } from "./mutate-record.interactor";
import { recordDto, withMemberUsers } from "./query-records.interactor";
import { resolveRecordPath } from "./record-relationship-path";
import { visibleFormulaFields } from "./record-formula-visibility";
import { recordLinkColors, recordLinkIcons, type RecordLinkColors, type RecordLinkIcons } from "./record-presentation";
import type { RecordDetailLayoutReader } from "./record-detail-layout-reader";
import type { RecordDetailLayoutResult } from "./record-detail-layout.schema";

export const GetRecordEditorSchema = z.object({ typeId: z.uuid(), recordId: z.uuid().optional() }).strict();
export type RecordEditorContext = {
  model: RecordModelView;
  typeId: string;
  permittedActions: Action[];
  canManageSchema: boolean;
  linkColors: RecordLinkColors;
  linkIcons: RecordLinkIcons;
  systemActions?: Array<"manageMembership">;
  detailLayout?: RecordDetailLayoutResult;
};
export type RecordEditorResult = RecordEditorContext & { record: RecordDto | null };

@AllowInDemoMode
@TenantInteractor()
export class GetRecordEditorInteractor extends AuthenticatedInteractor<
  z.infer<typeof GetRecordEditorSchema>,
  RecordEditorResult
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private layouts: RecordDetailLayoutReader,
  ) {
    super();
  }

  @Validate(GetRecordEditorSchema)
  async invoke(input: z.infer<typeof GetRecordEditorSchema>): Validated<RecordEditorResult> {
    return this.read(input);
  }

  read(input: z.infer<typeof GetRecordEditorSchema>, options: TrashReadOptions = {}): Validated<RecordEditorResult> {
    return runInTransaction(
      async () => {
        const [storedModel, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        const model = liveRecordModel(storedModel);
        const type = model.types.find((type) => type.id === input.typeId && !type.archived);
        if (!type || !policy.actor || !policy.canReadType(type.id))
          return failNotFound(CustomErrorCode.recordTypeNotFound);
        const ref = input.recordId ? { typeId: type.id, recordId: input.recordId } : null;
        const stored = ref ? await this.records.getRecordCompanyWide(ref, options) : null;
        if (ref && (!stored || !(await policy.canRead(stored)))) return failNotFound(CustomErrorCode.recordNotFound);
        const accessible = new Set(
          model.types.filter((type) => !type.archived && policy.canReadType(type.id)).map((type) => type.id),
        );
        const types = model.types
          .filter(
            (candidate) =>
              accessible.has(candidate.id) &&
              (candidate.id === type.id ||
                (candidate.embedded &&
                  model.relationships.some(
                    (relation) =>
                      relation.id === candidate.parentRelationshipId &&
                      !relation.archived &&
                      relation.targetTypeId === type.id,
                  ))),
          )
          .map((type) => ({
            ...type,
            relationshipPaths: type.relationshipPaths?.filter((path) => {
              const steps = resolveRecordPath(type.id, path.path, model);
              return !path.archived && steps && steps.every((step) => accessible.has(step.typeId));
            }),
          }));
        const ids = new Set(types.map((type) => type.id));
        const pathRelations = new Set(
          types.flatMap(
            (type) => type.relationshipPaths?.flatMap((path) => path.path.map((step) => step.relationId)) ?? [],
          ),
        );
        const relationships = model.relationships.filter(
          (relation) =>
            !relation.archived &&
            accessible.has(relation.sourceTypeId) &&
            accessible.has(relation.targetTypeId) &&
            (ids.has(relation.sourceTypeId) || ids.has(relation.targetTypeId) || pathRelations.has(relation.id)),
        );
        try {
          const layout = await this.layouts.read(type.id, model, policy);
          if (!layout.ok) return layout;
          const visible = ref
            ? await this.records.getVisibleFields(ref, storedModel, policy.access([...accessible]))
            : new Set<string>();
          const record = stored
            ? (
                await withMemberUsers(
                  [recordDto(stored, storedModel, visible, policy.memberScope)],
                  this.records,
                  policy.memberScope,
                )
              )[0]
            : null;
          if (record && recordChannelsEnabled(model, type.id))
            record.identities = await this.records.getIdentitiesCompanyWide(record.ref);
          return {
            ok: true,
            data: {
              typeId: type.id,
              record,
              detailLayout: layout.data,
              canManageSchema: policy.canManageSchema,
              linkColors: recordLinkColors(model.types, relationships),
              linkIcons: recordLinkIcons(model.types, relationships),
              systemActions:
                stored?.protectedKind === "membershipAuthorization" &&
                policy.allowedSystem("users", "update") &&
                policy.allowedSystem("users", "readAll")
                  ? ["manageMembership"]
                  : [],
              permittedActions: (["create", "readOwn", "readAll", "update", "delete"] as const).filter(
                (action) =>
                  policy.allowed(type.id, action) &&
                  (!stored?.protectedKind || ["readOwn", "readAll"].includes(action)),
              ),
              model: {
                ...model,
                types,
                fields: visibleFormulaFields(
                  model.fields.filter((field) => ids.has(field.typeId) && !field.archived),
                  model,
                  policy,
                ),
                relationships,
                capabilities: model.capabilities.filter((binding) => ids.has(binding.typeId)),
                accessPresets: [],
              },
            },
          };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}
