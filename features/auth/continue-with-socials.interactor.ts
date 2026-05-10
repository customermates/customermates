import type { FindUserRepo } from "../user/user.service";
import type { AuthService } from "./auth.service";
import type { Data } from "@/core/validation/validation.utils";

import { redirect } from "next/navigation";
import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { mustVerifyEmail } from "./email-verification-grace";

const Schema = z.object({
  provider: z.enum(["google", "microsoft"]),
  callbackURL: z.string().optional(),
});
export type ContinueWithSocialsData = Data<typeof Schema>;

@SystemInteractor
export class ContinueWithSocialsInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly findUserRepo: FindUserRepo,
  ) {}

  @Enforce(Schema)
  async invoke(data: ContinueWithSocialsData): Promise<void> {
    const res = await this.authService.continueWithSocials(data);

    if ("user" in res && res.user) {
      const userExists = (await this.findUserRepo.findCurrentUser(res.user.email)) !== null;

      if (!userExists) {
        await this.authService.sendNewUserNotificationEmail({
          email: res.user.email,
          name: res.user.name,
          provider: data.provider,
        });
      }

      if (mustVerifyEmail(res.user)) redirect("/auth/verify-email");
    }

    if (res.redirect) redirect(res.url ?? data.callbackURL ?? "/");
  }
}
