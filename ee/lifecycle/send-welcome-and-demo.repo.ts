import type { User } from "@/generated/prisma";

export abstract class SendWelcomeAndDemoActionRepo {
  abstract findProspectUsers(): Promise<User[]>;
  abstract claimWelcomeEmailForLoginUnscoped(args: {
    email: string;
    userIds: string[];
    sentAt: Date;
  }): Promise<boolean>;
}
