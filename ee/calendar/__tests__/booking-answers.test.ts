import { describe, expect, it } from "vitest";

import type { PublicQuestion } from "../booking.schema";

import { checkBookingAnswers, describeBookingAnswers } from "../booking-answers";

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const QUESTIONS: PublicQuestion[] = [
  { fieldId: ID(1), label: "Topic", kind: "text", required: true, options: [] },
  {
    fieldId: ID(2),
    label: "Team size",
    kind: "select",
    required: false,
    options: [
      { id: "small", label: "1 to 10" },
      { id: "large", label: "11 or more" },
    ],
  },
  { fieldId: ID(3), label: "Website", kind: "url", required: false, options: [] },
  { fieldId: ID(4), label: "Budget", kind: "number", required: false, options: [] },
  { fieldId: ID(5), label: "Terms", kind: "boolean", required: true, options: [] },
  { fieldId: ID(6), label: "Start", kind: "date", required: false, options: [] },
];

describe("checkBookingAnswers", () => {
  it("accepts valid answers and trims text", () => {
    const result = checkBookingAnswers(QUESTIONS, {
      [ID(1)]: "  Pricing  ",
      [ID(2)]: "large",
      [ID(3)]: "https://example.com",
      [ID(4)]: 1200,
      [ID(5)]: true,
      [ID(6)]: "2026-12-01",
    });

    expect(result.invalid).toEqual([]);
    expect(result.values).toEqual([
      { fieldId: ID(1), value: "Pricing" },
      { fieldId: ID(2), value: "large" },
      { fieldId: ID(3), value: "https://example.com" },
      { fieldId: ID(4), value: 1200 },
      { fieldId: ID(5), value: true },
      { fieldId: ID(6), value: "2026-12-01" },
    ]);
  });

  it("flags a missing required text answer and an unchecked required checkbox", () => {
    const result = checkBookingAnswers(QUESTIONS, { [ID(1)]: "   ", [ID(5)]: false });

    expect(result.invalid).toEqual([ID(1), ID(5)]);
  });

  it("skips optional answers that are empty", () => {
    const result = checkBookingAnswers(QUESTIONS, { [ID(1)]: "Topic", [ID(5)]: true, [ID(2)]: "" });

    expect(result.invalid).toEqual([]);
    expect(result.values.map((value) => value.fieldId)).toEqual([ID(1), ID(5)]);
  });

  it("rejects values of the wrong kind, unknown options, non-http links and malformed dates", () => {
    const result = checkBookingAnswers(QUESTIONS, {
      [ID(1)]: 5 as unknown as string,
      [ID(2)]: "huge",
      [ID(3)]: "javascript:alert(1)",
      [ID(4)]: "12" as unknown as number,
      [ID(5)]: true,
      [ID(6)]: "01.12.2026",
    });

    expect(result.invalid).toEqual([ID(1), ID(2), ID(3), ID(4), ID(6)]);
  });

  it("ignores answers for fields that are not questions", () => {
    const result = checkBookingAnswers(QUESTIONS, { [ID(1)]: "x", [ID(5)]: true, [ID(9)]: "secret" });

    expect(result.values.some((value) => value.fieldId === ID(9))).toBe(false);
  });
});

describe("describeBookingAnswers", () => {
  it("prints the option label, a mark for checkboxes and the plain value otherwise", () => {
    const text = describeBookingAnswers(QUESTIONS, [
      { fieldId: ID(2), value: "small" },
      { fieldId: ID(5), value: true },
      { fieldId: ID(4), value: 5 },
    ]);

    expect(text).toEqual([
      { label: "Team size", text: "1 to 10" },
      { label: "Terms", text: "✓" },
      { label: "Budget", text: "5" },
    ]);
  });
});
