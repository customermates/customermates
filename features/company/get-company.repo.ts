export abstract class GetCompanyRepo {
  abstract findCompanyOrThrow(): Promise<{ id: string; createdAt: Date; updatedAt: Date }>;
}
