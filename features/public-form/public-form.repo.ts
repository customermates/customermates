import type { PublicFormConfig } from "./public-form.schema";

export type StoredPublicForm = {
  id: string;
  typeId: string;
  name: string;
  createdById: string;
  enabled: boolean;
  config: unknown;
  consentVersion: number;
  submissionCount: number;
  lastSubmittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewPublicFormSubmission = {
  id: string;
  formId: string;
  outcome: "created" | "duplicate";
  recordId: string | null;
  personRecordId: string | null;
  ipHash: string | null;
  locale: string | null;
  consent: { text: string; version: number; at: Date } | null;
};

export type PublicFormCreate = {
  typeId: string;
  name: string;
  enabled: boolean;
  config: PublicFormConfig;
};

export type PublicFormPatch = {
  name?: string;
  enabled?: boolean;
  config?: PublicFormConfig;
  consentVersion?: number;
};

export abstract class PublicFormRepo {
  abstract findForm(id: string): Promise<StoredPublicForm | null>;
  abstract findFormOfType(typeId: string): Promise<StoredPublicForm | null>;
  abstract listForms(typeId?: string): Promise<StoredPublicForm[]>;
  abstract createForm(data: PublicFormCreate): Promise<StoredPublicForm>;
  abstract updateForm(id: string, patch: PublicFormPatch): Promise<StoredPublicForm>;
  abstract countSubmissionsSince(since: Date): Promise<number>;
  abstract countFormSubmissionsSince(formId: string, since: Date, ipHash?: string): Promise<number>;
  abstract recordSubmission(submission: NewPublicFormSubmission): Promise<{ id: string }>;
  abstract publicLinksAllowed(): Promise<boolean>;
}
