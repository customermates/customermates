import type { Validated } from "@/core/validation/validation.utils";

import { redirect } from "next/navigation";

import { AuthService } from "./auth.service";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

@SystemInteractor
export class SignOutInteractor {
  constructor(private readonly authService: AuthService) {}

  async invoke(): Validated<void> {
    await this.authService.signOut();

    redirect("/");
  }
}
