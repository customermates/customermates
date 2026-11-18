export const EXTERNAL_TRIGGER_EVENTS = ["form.submitted", "webhook.received", "booking.changed"] as const;

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

export const BOOKING_CHANGES = ["cancelled", "rescheduled"] as const;
export type BookingChange = (typeof BOOKING_CHANGES)[number];

export type BookingChangedPayload = {
  bookingId: string;
  bookingLinkId: string;
  bookingLinkName: string;
  change: BookingChange;
  by: "invitee" | "host";
  typeId: string | null;
  recordId: string | null;
  personRecordId: string | null;
  hostUserId: string;
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
