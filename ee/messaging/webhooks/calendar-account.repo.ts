import { FindAccountByUnipileIdUnscopedRepo } from "../persistence/find-account-by-unipile-id-unscoped.repo";

export abstract class CalendarAccountRepo extends FindAccountByUnipileIdUnscopedRepo {
  abstract markAccountHasCalendarUnscoped(unipileAccountId: string): Promise<void>;
}
