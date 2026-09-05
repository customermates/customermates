export abstract class InviteTokenCookieRepo {
  abstract read(): Promise<string | undefined>;
  abstract clear(): Promise<void>;
}
