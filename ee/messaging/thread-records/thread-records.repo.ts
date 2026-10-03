import type { RecordRef } from "@/features/records/record-model.schema";

export abstract class ThreadRecordsRepo {
  abstract canAccessThread(threadId: string): Promise<boolean>;
  abstract listLinks(threadId: string, take: number): Promise<Array<RecordRef & { protected?: boolean }>>;
  abstract has(threadId: string, ref: RecordRef): Promise<boolean>;
  abstract link(threadId: string, ref: RecordRef): Promise<void>;
  abstract unlink(threadId: string, ref: RecordRef): Promise<void>;
  abstract audit(threadId: string, ref: RecordRef, action: "link" | "unlink"): Promise<void>;
}
