import type { SendContactInquiryData } from "@/features/contact/send-contact-inquiry.schema";

export type ContactFormValues = {
  name: string;
  email: string;
  company: string;
  message: string;
  privacyAcknowledged: boolean;
};

export type ContactFormField = keyof ContactFormValues;

export type ContactFormErrors = {
  errors?: string[];
  properties?: Partial<Record<ContactFormField, { errors?: string[] }>>;
};

export const EMPTY_CONTACT_FORM: ContactFormValues = {
  name: "",
  email: "",
  company: "",
  message: "",
  privacyAcknowledged: false,
};

export function toContactInquiry(form: ContactFormValues): SendContactInquiryData {
  return { ...form, company: form.company.trim() ? form.company : undefined };
}

export function isContactFormDirty(form: ContactFormValues): boolean {
  return (Object.keys(EMPTY_CONTACT_FORM) as ContactFormField[]).some(
    (field) => form[field] !== EMPTY_CONTACT_FORM[field],
  );
}

export function hasFieldError(errors: ContactFormErrors | undefined, field: ContactFormField): boolean {
  return (errors?.properties?.[field]?.errors?.length ?? 0) > 0;
}
