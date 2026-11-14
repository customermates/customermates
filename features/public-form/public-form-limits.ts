export const PUBLIC_FORM_LIMITS = {
  maxFields: 40,
  maxAnswerChars: 5_000,
  maxRichTextChars: 10_000,
  maxBodyChars: 60_000,
  minFillMs: 2_000,
  maxFillMs: 24 * 60 * 60 * 1_000,
  ipBucket: { capacity: 5, windowMs: 10 * 60_000 },
  formBucket: { capacity: 60, windowMs: 10 * 60_000 },
  viewBucket: { capacity: 120, windowMs: 60_000 },
  perIpPerHour: 20,
  perFormPerHour: 300,
} as const;
