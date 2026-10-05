export abstract class CreateHostedAuthLinkRepo {
  abstract countActiveAccountsForUser(): Promise<number>;
}
