import type { Company } from "@/generated/prisma";

export abstract class GetCompanySettingsRepo {
  abstract getDetails(): Promise<Company>;
}
