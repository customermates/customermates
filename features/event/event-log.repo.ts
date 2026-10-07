export type EventLogEntry = {
  kind: string;
  subjectId: string;
  actorId: string | null;
  payload: unknown;
  delivered: boolean;
};

export abstract class EventLogRepo {
  abstract appendUnscoped(companyId: string, entry: EventLogEntry): Promise<void>;
  abstract hasSubscribersUnscoped(companyId: string, kind: string): Promise<boolean>;
}
