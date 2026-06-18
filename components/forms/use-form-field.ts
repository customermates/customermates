import { useTranslations } from "next-intl";

import { useAppForm } from "./form-context";

export function useFormFieldErrors(id: string) {
  const store = useAppForm();
  const errors = store?.getError(id);
  const hasError = Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
  return { store, errors, hasError };
}

export function useResolvedFieldLabel(id: string, label: string | null | undefined) {
  const t = useTranslations();
  return label === null ? undefined : (label ?? t(`Common.inputs.${id}`));
}
