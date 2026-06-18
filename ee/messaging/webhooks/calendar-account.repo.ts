import { FindAccountByUnipileIdUnscopedRepo } from "../persistence/find-account-by-unipile-id-unscoped.repo";

export abstract class CalendarAccountRepo extends FindAccountByUnipileIdUnscopedRepo {
  abstract markAccountHasCalendar(unipileAccountId: string): Promise<void>;
}
