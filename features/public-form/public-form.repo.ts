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

export type SubmissionAnswer = { fieldId: string | null; label: string; value: string };

export type NewPublicFormSubmission = {
  id: string;
  formId: string;
  outcome: "created" | "duplicate";
  recordId: string | null;
  personRecordId: string | null;
  ipHash: string | null;
  locale: string | null;
  consent: { text: string; version: number; at: Date } | null;
  answers: SubmissionAnswer[] | null;
};

export const FAILED_SUBMISSION_OUTCOME = "failed";
export const DUPLICATE_SUBMISSION_OUTCOME = "duplicate";

export type DuplicatePublicFormSubmission = {
  id: string;
  createdAt: Date;
  recordId: string | null;
  answers: SubmissionAnswer[];
};

export type PublicFormDuplicates = { count: number; items: DuplicatePublicFormSubmission[] };

export type FailedPublicFormSubmission = {
  id: string;
  formId: string;
  personRecordId: string | null;
  ipHash: string | null;
  locale: string | null;
};

export type PublicFormFailures = { count: number; lastAt: Date | null };

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
  abstract recordFailedSubmission(submission: FailedPublicFormSubmission): Promise<void>;
  abstract failedSubmissionsSince(formId: string, since: Date): Promise<PublicFormFailures>;
  abstract duplicateSubmissionsSince(formId: string, since: Date, limit: number): Promise<PublicFormDuplicates>;
  abstract workspaceName(): Promise<string | null>;
  abstract deleteSubmissionsBeforeUnscoped(before: Date, limit: number): Promise<number>;
  abstract reassignCreatorUnscoped(args: {
    companyId: string;
    fromUserIds: string[];
    toUserId: string;
  }): Promise<number>;
  abstract publicLinksAllowed(): Promise<boolean>;
}
