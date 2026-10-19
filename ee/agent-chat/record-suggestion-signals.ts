import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { AgentDataCounts } from "./agent-chat.schema";

import { UserAccessor } from "@/core/base/user-accessor";
import { RecordQuerySchema } from "@/features/records/record-query.schema";

type RecordSignals = Pick<AgentDataCounts, "records">;

export class RecordSuggestionSignals extends UserAccessor {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  async read(): Promise<RecordSignals> {
    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    if (!policy.actor) return { records: false };
    const lists = model.types.filter((type) => !type.archived && !type.embedded).map((type) => type.id);
    const access = policy.access(model.types.filter((type) => !type.archived).map((type) => type.id));
    for (const typeId of lists) {
      if (access.get(typeId)?.access === "none") continue;
      const result = await this.records.query(
        RecordQuerySchema.parse({ typeId, fields: [], pageSize: 1 }),
        model,
        access,
        policy.memberScope,
      );
      if (result.total > 0) return { records: true };
    }
    return { records: false };
  }
}
