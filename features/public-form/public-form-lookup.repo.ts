import type { StoredBrand } from "@/features/workspace-brand/workspace-brand.repo";
import type { StoredPublicForm } from "./public-form.repo";

export type PublicFormLookup = StoredPublicForm & {
  companyId: string;
  company: { name: string | null; allowPublicLinks: boolean; deletingAt: Date | null; brand?: StoredBrand | null };
  type: { archived: boolean };
};

export abstract class PublicFormLookupRepo {
  abstract findFormUnscoped(formId: string): Promise<PublicFormLookup | null>;
}
