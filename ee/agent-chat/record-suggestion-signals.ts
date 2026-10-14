import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { AgentDataCounts } from "./agent-chat.schema";

import { UserAccessor } from "@/core/base/user-accessor";
import { presetId } from "@/features/records/crm-preset";
import { RecordQuerySchema } from "@/features/records/record-query.schema";

type RecordSignals = Pick<AgentDataCounts, "contacts" | "deals">;

const STARTER_TYPES = [
  ["contacts", "contact"],
  ["deals", "deal"],
] as const;

export class RecordSuggestionSignals extends UserAccessor {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  async read(): Promise<RecordSignals> {
    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    const access = policy.access(model.types.filter((type) => !type.archived).map((type) => type.id));
    const counts = await Promise.all(
      STARTER_TYPES.map(async ([key, preset]) => {
        const typeId = presetId(this.companyId, preset);
        if (
          !policy.actor ||
          !model.types.some((type) => type.id === typeId && !type.archived) ||
          access.get(typeId)?.access === "none"
        )
          return [key, false] as const;
        const result = await this.records.query(
          RecordQuerySchema.parse({ typeId, fields: [], pageSize: 1 }),
          model,
          access,
          policy.memberScope,
        );
        return [key, result.total > 0] as const;
      }),
    );
    return Object.fromEntries(counts) as RecordSignals;
  }
}
