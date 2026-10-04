import { UserAccessor } from "@/core/base/user-accessor";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { randomUUID } from "node:crypto";
import { valueResult } from "./calculation";
import type { MembershipTaskRepo } from "./membership-task.repo";
import type { RecordAccessPolicy } from "./record-access";
import { RecordCalculationService, recordKey, SYNCHRONOUS_RECORD_LIMIT } from "./record-calculation.service";
import { recordInvariant } from "./record-invariant";
import { RecordJournal } from "./record-journal";
import type { RecordRef } from "./record-model.schema";
import { normalizeRecordScalar, RecordWriteError } from "./record-write.service";
import type { RecordRepo } from "./record.repo";

export class MembershipTaskService extends UserAccessor {
  constructor(
    private records: RecordRepo,
    private tasks: MembershipTaskRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  registered(userId: string): Promise<void> {
    return this.synchronize(userId, "registered");
  }

  updated(userId: string): Promise<void> {
    return this.synchronize(userId, "updated");
  }

  private synchronize(userId: string, reason: "registered" | "updated"): Promise<void> {
    return runInTransaction(async () => {
      const member = await this.tasks.getMemberCompanyWide(userId);
      if (!member) throw new RecordWriteError(CustomErrorCode.userNotFound, "not_found");
      const state = await this.records.getState();
      if (!state?.revision) throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
      const model = await this.records.getModel();
      const bindings = model.capabilities.filter((binding) => binding.kind === "membershipAuthorization");
      if (bindings.length !== 1) throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
      const binding = recordInvariant(bindings[0]);
      const type = model.types.find((candidate) => candidate.id === binding.typeId && !candidate.archived);
      if (!type || type.embedded) throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
      const existing = await this.tasks.findCompanyWide(type.id, userId, SYNCHRONOUS_RECORD_LIMIT + 1);
      const create = reason === "registered" && member.status === "pendingAuthorization" && existing.length === 0;
      const remove = member.status !== "pendingAuthorization" && existing.length > 0;
      if (!create && !remove) return;
      const policy = await this.policy.load();
      if (this.userId !== userId && !policy.allowedSystem("users", "update"))
        throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
      if (state.activeOperationId) throw new RecordWriteError(CustomErrorCode.recordWritePaused, "conflict");
      if (existing.length > SYNCHRONOUS_RECORD_LIMIT)
        throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
      const journal = new RecordJournal(this.records, model);
      const records = journal.repository;
      const seeds = new Map<string, RecordRef>();
      const captures = new Map<string, Set<string>>();
      const created = create ? { typeId: type.id, recordId: randomUUID() } : null;
      if (created) {
        await records.create(created, []);
        await this.tasks.protect(created, userId);
        for (const field of model.fields.filter((field) => field.typeId === type.id && !field.archived)) {
          if (field.behavior.kind !== "input") continue;
          const value =
            field.id === type.primaryFieldId
              ? { kind: "text" as const, value: `User Pending Authorization (${member.email})` }
              : (field.behavior.defaultValue ?? null);
          if (value?.kind === "member" && (await this.tasks.getMemberCompanyWide(value.value))?.status !== "active")
            throw new RecordWriteError(CustomErrorCode.recordValueInvalid);
          await records.setValue(
            created,
            field.id,
            valueResult(normalizeRecordScalar(value, { ...field, required: false })),
            model.revision,
          );
          await records.setValueDependencies(created, field.id, []);
        }
        captures.set(
          recordKey(created),
          new Set(
            model.fields
              .filter(
                (field) =>
                  field.typeId === type.id &&
                  !field.archived &&
                  field.behavior.kind === "snapshot" &&
                  field.behavior.capture === "create",
              )
              .map((field) => field.id),
          ),
        );
        seeds.set(recordKey(created), created);
      }
      for (const ref of remove ? existing : []) {
        const links = await records.getLinksCompanyWide(ref, SYNCHRONOUS_RECORD_LIMIT + 1);
        if (links.length > SYNCHRONOUS_RECORD_LIMIT)
          throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
        for (const link of links) {
          seeds.set(recordKey(link.source), link.source);
          seeds.set(recordKey(link.target), link.target);
        }
        if (seeds.size > SYNCHRONOUS_RECORD_LIMIT)
          throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
        seeds.set(recordKey(ref), ref);
        await records.delete(ref);
      }
      const calculated = await new RecordCalculationService(records).recalculate(
        model,
        [...seeds.values()],
        await records.getWorkspaceCurrencyOrThrow(),
        captures,
      );
      if (!calculated.complete) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
      const deleted = new Set((remove ? existing : []).map(recordKey));
      for (const ref of calculated.changed) seeds.set(recordKey(ref), ref);
      for (const [key, ref] of seeds)
        if (!deleted.has(key) && (!created || key !== recordKey(created))) await records.touch(ref);
      await journal.flush(model, this.userId, randomUUID(), { kind: "system" });
    });
  }

  getSystemTasksCount(): Promise<number> {
    return runInTransaction(
      async () => {
        if (!(await this.records.getState())?.revision)
          throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor || !policy.allowedSystem("users", "update")) return 0;
        const types = model.capabilities
          .filter((binding) => binding.kind === "membershipAuthorization")
          .map((binding) => binding.typeId);
        const access = policy.access(types);
        let count = 0;
        for (const typeId of types) count += await this.tasks.count(typeId, recordInvariant(access.get(typeId)));
        return count;
      },
      { readOnly: true },
    );
  }
}
