import type { AuthService } from "./auth.service";
import type { Redirect } from "./auth-outcome";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { redirectTo } from "./auth-outcome";

@SystemInteractor
export class SignOutInteractor {
  constructor(private readonly authService: AuthService) {}

  async invoke(): Promise<Redirect> {
    await this.authService.signOut();

    return redirectTo("/");
  }
}
