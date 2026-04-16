import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({
  searchTerm: z.string().min(1),
});

export type GlobalSearchData = z.infer<typeof Schema>;

export type GlobalSearchResultItem =
  | { type: "contact"; id: string; name: string }
  | { type: "organization"; id: string; name: string }
  | { type: "deal"; id: string; name: string }
  | { type: "service"; id: string; name: string };

export type GlobalSearchResult = {
  results: GlobalSearchResultItem[];
};

const GlobalSearchResultSchema = z.object({
  results: z.array(
    z.object({
      type: z.enum(["contact", "organization", "deal", "service"]),
      id: z.string(),
      name: z.string(),
    }),
  ),
});

export abstract class GlobalSearchRepo {
  abstract search(data: GlobalSearchData): Promise<GlobalSearchResult>;
}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.contacts, action: Action.readOwn },
    { resource: Resource.organizations, action: Action.readAll },
    { resource: Resource.organizations, action: Action.readOwn },
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.deals, action: Action.readOwn },
    { resource: Resource.services, action: Action.readAll },
    { resource: Resource.services, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GlobalSearchInteractor extends BaseInteractor<GlobalSearchData, GlobalSearchResult> {
  constructor(private repo: GlobalSearchRepo) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(GlobalSearchResultSchema)
  async invoke(data: GlobalSearchData): Promise<{ ok: true; data: GlobalSearchResult }> {
    return { ok: true as const, data: await this.repo.search(data) };
  }
}
