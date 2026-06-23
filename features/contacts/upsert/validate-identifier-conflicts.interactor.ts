import type { z } from "zod";

import type { ContactIdentifierOwnersRepo } from "../contact-identifier-owners.repo";

import { type ContactIdentifiers, collectIdentifierPairs, validateIdentifierConflicts } from "./validate-identifiers";

export class ValidateIdentifierConflictsInteractor {
  constructor(private repo: ContactIdentifierOwnersRepo) {}

  async invoke(
    contacts: ContactIdentifiers[],
    ctx: z.RefinementCtx,
    basePathFor: (index: number) => (string | number)[],
  ) {
    const owners = await this.repo.findIdentifierOwnersCompanyWide(collectIdentifierPairs(contacts));
    validateIdentifierConflicts(contacts, owners, ctx, basePathFor);
  }
}
