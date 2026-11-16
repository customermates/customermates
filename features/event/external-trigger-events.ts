export const EXTERNAL_TRIGGER_EVENTS = ["form.submitted", "webhook.received"] as const;

export type ExternalTriggerEvent = (typeof EXTERNAL_TRIGGER_EVENTS)[number];

export type ExternalAnswers = Record<string, string>;

export type FormSubmittedPayload = {
  source: "form" | "booking";
  formId: string;
  formName: string;
  typeId: string;
  submissionId: string;
  outcome: "created" | "duplicate";
  recordId: string | null;
  personRecordId: string | null;
  answers: ExternalAnswers;
};

export type WebhookReceivedPayload = {
  webhookId: string;
  webhookName: string;
  typeId: string;
  deliveryId: string;
  outcome: "created" | "updated";
  recordId: string | null;
};
