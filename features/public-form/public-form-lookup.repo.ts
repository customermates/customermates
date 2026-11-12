import type { StoredPublicForm } from "./public-form.repo";

export type PublicFormLookup = StoredPublicForm & {
  companyId: string;
  company: { name: string | null; allowPublicLinks: boolean; deletingAt: Date | null };
  type: { archived: boolean };
};

export abstract class PublicFormLookupRepo {
  abstract findFormUnscoped(formId: string): Promise<PublicFormLookup | null>;
}
