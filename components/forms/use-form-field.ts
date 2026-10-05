import { useTranslations } from "next-intl";

import { useAppForm } from "./form-context";

function hasErrors(errors: string | string[] | undefined) {
  return Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
}

export function useFormFieldErrors(id: string) {
  const store = useAppForm();
  const errors = store?.getError(id);
  const hasError = hasErrors(errors);
  return { store, errors, hasError };
}

export function useFormFieldItemErrors(id: string, itemCount: number) {
  const { store, hasError: hasFieldError } = useFormFieldErrors(id);
  const itemErrors = Array.from({ length: itemCount }, (_, index) => hasErrors(store?.getError(`${id}[${index}]`)));
  return { itemErrors, hasError: hasFieldError || itemErrors.some(Boolean) };
}

export function useResolvedFieldLabel(id: string, label: string | null | undefined) {
  const t = useTranslations();

  if (label === null) return undefined;
  if (label !== undefined) return label;

  return t(`Common.inputs.${id}`);
}
