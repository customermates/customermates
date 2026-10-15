export abstract class GetCompanyRepo {
  abstract findCompanyOrThrow(): Promise<{ id: string; name: string | null; createdAt: Date; updatedAt: Date }>;
}
