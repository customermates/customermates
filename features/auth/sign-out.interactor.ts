import type { AuthService } from "./auth.service";

import { redirect } from "next/navigation";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

@SystemInteractor
export class SignOutInteractor {
  constructor(private readonly authService: AuthService) {}

  async invoke(): Promise<void> {
    await this.authService.signOut();

    redirect("/");
  }
}
