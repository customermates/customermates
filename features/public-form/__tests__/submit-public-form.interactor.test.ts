import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, MOCK_PRISMA_DB_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { runWithTenant } from "@/core/decorators/tenant-context";
import { renderToken, renderTokenIssuedTo } from "@/core/network/public-submit-guard";
import { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DomainEvent } from "@/features/event/domain-events";
import { PublicFormAccess } from "../public-form-access";
import { ANSWER_LIMITS } from "@/features/records/record-value-coercion";
import { PUBLIC_FORM_LIMITS, SubmitPublicFormSchema } from "../public-form.schema";
import { publicFormToken } from "../public-form-token";
import { ReadPublicFormInteractor } from "../read-public-form.interactor";
import { SubmitPublicFormInteractor } from "../submit-public-form.interactor";
import {
  COMPANY_ID,
  CONTACT_FIELD,
  FORM_ID,
  NAME_FIELD,
  NOTES_FIELD,
  PEOPLE_TYPE_ID,
  PERSON_NAME_FIELD,
  RELATION_ID,
  SECRET,
  SIZE_FIELD,
  TYPE_ID,
  UNLIMITED_PUBLIC_FORM_QUOTA,
  USER_ID,
  createConfig,
  createModel,
} from "./public-form-fixtures";

const now = new Date("2026-11-13T10:00:00.000Z");
const RECORD_ID = "00000000-0000-4000-8000-0000000000aa";
const PERSON_ID = "00000000-0000-4000-8000-0000000000ab";
const creator = createMockUser({ id: USER_ID, companyId: COMPANY_ID });
const completed = (typeId: string, recordId: string) => ({
  ok: true,
  data: { status: "completed", refs: [{ typeId, recordId }], schemaRevision: 3 },
});
const failure = (code: string, path: Array<string | number> = []) => ({
  ok: false,
  error: { issues: [{ code: "custom", path, params: { error: code } }] },
});

type Setup = {
  config?: ReturnType<typeof createConfig>;
  form?: Record<string, unknown>;
  company?: Record<string, unknown>;
  type?: Record<string, unknown>;
  tenantUser?: typeof creator;
  allowed?: boolean;
  monthly?: number | null;
  monthCount?: number;
  hourIpCount?: number;
  hourFormCount?: number;
  owners?: Array<{ ref: { typeId: string; recordId: string } }>;
  writes?: unknown[];
  model?: ReturnType<typeof createModel>;
  burst?: number;
  formBurst?: number;
};

function setup(options: Setup = {}) {
  const config = options.config ?? createConfig();
  const lookupForm = {
    id: FORM_ID,
    companyId: COMPANY_ID,
    typeId: TYPE_ID,
    name: "Website contact form",
    createdById: USER_ID,
    enabled: true,
    config,
    consentVersion: 4,
    submissionCount: 0,
    lastSubmittedAt: null,
    createdAt: now,
    updatedAt: now,
    company: { name: "Acme", allowPublicLinks: true, deletingAt: null, ...options.company },
    type: { archived: false, ...options.type },
    ...options.form,
  };
  const via: unknown[] = [];
  const tenant = {
    run: (
      _creatorId: string,
      read: () => Promise<unknown>,
      unavailable: () => Promise<unknown>,
      attribution: unknown,
    ) => {
      via.push(attribution);
      return options.tenantUser === undefined && options.allowed !== false
        ? runWithTenant(creator, read)
        : options.allowed === false
          ? unavailable()
          : runWithTenant(options.tenantUser as typeof creator, read);
    },
  };
  const limiters = {
    view: new TokenBucketRateLimiter(1_000, 60_000),
    visitorSubmit: new TokenBucketRateLimiter(options.burst ?? 1_000, 60_000),
    formSubmit: new TokenBucketRateLimiter(options.formBurst ?? 1_000, 60_000),
  };
  const access = new PublicFormAccess(
    { findFormUnscoped: () => Promise.resolve(lookupForm) } as never,
    tenant as never,
    limiters,
    {
      authSecret: SECRET,
      now: () => now,
    },
  );
  const model = options.model ?? createModel();
  const records = {
    getModel: vi.fn(() => Promise.resolve(model)),
    getIdentityOwnersCompanyWide: vi.fn(() => Promise.resolve(options.owners ?? [])),
  };
  const policy = {
    load: () => Promise.resolve({ actor: { id: USER_ID }, allowed: () => true, canReadType: () => true }),
  };
  const writer = {
    invoke: vi.fn((input: { mutation: { typeId?: string } }) => {
      options.writes?.push(input);
      return Promise.resolve(
        completed(input.mutation.typeId ?? TYPE_ID, input.mutation.typeId === PEOPLE_TYPE_ID ? PERSON_ID : RECORD_ID),
      );
    }),
  };
  const events = { publish: vi.fn(() => Promise.resolve()) };
  const forms = {
    countSubmissionsSince: vi.fn(() => Promise.resolve(options.monthCount ?? 0)),
    countFormSubmissionsSince: vi.fn((_formId: string, _since: Date, ipHash?: string) =>
      Promise.resolve(ipHash ? (options.hourIpCount ?? 0) : (options.hourFormCount ?? 0)),
    ),
    recordSubmission: vi.fn(() => Promise.resolve({ id: "submission" })),
    recordFailedSubmission: vi.fn(() => Promise.resolve()),
  };
  const quota = {
    limits: () =>
      Promise.resolve({ submissionsPerMonth: options.monthly ?? null, badge: options.monthly !== undefined }),
  };
  const submit = new SubmitPublicFormInteractor(
    access,
    forms as never,
    records as never,
    policy as never,
    writer as never,
    events as never,
    quota,
  );
  const read = new ReadPublicFormInteractor(access, records as never, policy as never, quota);
  return { submit, read, writer, events, forms, records, via, config };
}

const token = publicFormToken(FORM_ID, SECRET);
const fieldUuid = (index: number) => `00000000-0000-4000-8000-${String(index + 1000).padStart(12, "0")}`;

const VISITOR = "203.0.113.9";

function submission(overrides: Record<string, unknown> = {}) {
  const visitor = ("visitor" in overrides ? overrides.visitor : VISITOR) as string | null | undefined;
  return {
    token,
    renderToken: renderToken(FORM_ID, new Date(now.getTime() - 8_000), SECRET, visitor),
    consent: true,
    answers: { [NAME_FIELD]: "Ada Lovelace", [NOTES_FIELD]: "Hello" },
    visitor: VISITOR,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SubmitPublicFormInteractor", () => {
  it("creates the record as the form's member, stores the consent evidence and emits form.submitted", async () => {
    const writes: unknown[] = [];
    const { submit, writer, forms, events, via } = setup({ writes });

    const result = await submit.invoke(submission({ locale: "de" }));

    expect(result).toEqual({ status: "submitted", message: "Thank you. We received your message.", redirectUrl: null });
    expect(writer.invoke).toHaveBeenCalledTimes(1);
    expect(writes[0]).toMatchObject({
      expectedRevision: 3,
      idempotencyKey: expect.stringMatching(/^form:/u),
      mutation: {
        action: "create",
        typeId: TYPE_ID,
        fields: [
          { fieldId: NAME_FIELD, value: { kind: "text", value: "Ada Lovelace" } },
          { fieldId: NOTES_FIELD, value: expect.objectContaining({ kind: "richText" }) },
        ],
      },
    });
    expect(via).toEqual([{ kind: "form", name: "Website contact form" }]);
    expect(forms.recordSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        formId: FORM_ID,
        outcome: "created",
        recordId: RECORD_ID,
        locale: "de",
        ipHash: expect.stringMatching(/^[0-9a-f]{32}$/u),
        consent: { text: "I agree that you store my message.", version: 4, at: now },
      }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      DomainEvent.FORM_SUBMITTED,
      expect.objectContaining({
        payload: expect.objectContaining({
          source: "form",
          formId: FORM_ID,
          typeId: TYPE_ID,
          outcome: "created",
          recordId: RECORD_ID,
          answers: expect.objectContaining({ [NAME_FIELD]: "Ada Lovelace" }),
        }),
      }),
      { systemCompanyId: COMPANY_ID },
    );
  });

  it("never stores the raw address of the visitor", async () => {
    const { submit, forms } = setup();

    await submit.invoke(submission());

    expect(JSON.stringify(forms.recordSubmission.mock.calls)).not.toContain("203.0.113.9");
  });

  it("sends the visitor on to the redirect address when the form has one", async () => {
    const { submit } = setup({
      config: createConfig({ success: { message: "Done", redirectUrl: "https://example.com/thanks" } }),
    });

    expect(await submit.invoke(submission())).toEqual({
      status: "submitted",
      message: "Done",
      redirectUrl: "https://example.com/thanks",
    });
  });

  it("accepts a filled honeypot silently without creating anything", async () => {
    const { submit, writer, forms, events } = setup();

    const result = await submit.invoke(submission({ website: "https://spam.example" }));

    expect(result.status).toBe("submitted");
    expect(writer.invoke).not.toHaveBeenCalled();
    expect(forms.recordSubmission).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it.each([
    ["a form sent faster than a person can fill it", renderToken(FORM_ID, new Date(now.getTime() - 500), SECRET)],
    ["a forged render token", "1.deadbeef"],
    ["a render token of another form", renderToken("00000000-0000-4000-8000-0000000000f2", new Date(0), SECRET)],
    ["a render token that is far too old", renderToken(FORM_ID, new Date(now.getTime() - 30 * 24 * 3_600_000), SECRET)],
  ])("drops %s without telling a bot", async (_name, renderTokenValue) => {
    const { submit, writer } = setup();

    const result = await submit.invoke(submission({ renderToken: renderTokenValue }));

    expect(result.status).toBe("submitted");
    expect(writer.invoke).not.toHaveBeenCalled();
  });

  it("refuses a page that was rendered for another address, and says so instead of dropping the answers", async () => {
    const { submit, writer, forms } = setup();
    const elsewhere = renderToken(FORM_ID, new Date(now.getTime() - 8_000), SECRET, "198.51.100.7");

    expect(await submit.invoke(submission({ renderToken: elsewhere }))).toEqual({ status: "unavailable" });
    expect(writer.invoke).not.toHaveBeenCalled();
    expect(forms.recordSubmission).not.toHaveBeenCalled();
  });

  it("charges the bucket all visitors of a form share only after the spam checks passed", async () => {
    const { submit, writer } = setup({ formBurst: 1 });
    const tooFast = renderToken(FORM_ID, new Date(now.getTime() - 500), SECRET, VISITOR);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await submit.invoke(submission({ website: "https://spam.example" }));
      await submit.invoke(submission({ renderToken: tooFast }));
      await submit.invoke(submission({ renderToken: "1.deadbeef" }));
    }
    expect(writer.invoke).not.toHaveBeenCalled();

    expect((await submit.invoke(submission())).status).toBe("submitted");
    expect(writer.invoke).toHaveBeenCalledTimes(1);
    expect(await submit.invoke(submission())).toEqual({
      status: "rateLimited",
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("asks for the consent when the form needs it", async () => {
    const { submit, writer } = setup();

    expect(await submit.invoke(submission({ consent: false }))).toEqual({
      status: "invalid",
      errors: { consent: "consent" },
    });
    expect(writer.invoke).not.toHaveBeenCalled();
  });

  it("does not ask for consent when the form has none", async () => {
    const { submit } = setup({ config: createConfig({ consent: null }) });

    const result = await submit.invoke(submission({ consent: undefined }));

    expect(result.status).toBe("submitted");
  });

  it("reports the answers that are missing or not valid, per field", async () => {
    const { submit, writer } = setup();

    expect(await submit.invoke(submission({ answers: { [NAME_FIELD]: "" } }))).toEqual({
      status: "invalid",
      errors: { [NAME_FIELD]: "required" },
    });
    expect(writer.invoke).not.toHaveBeenCalled();
  });

  it("maps a refusal of the record engine back to the field it concerns", async () => {
    const { submit, writer } = setup();
    writer.invoke.mockResolvedValueOnce(
      failure(CustomErrorCode.recordValueInvalid, ["mutation", "fields", 0, "value"]) as never,
    );

    expect(await submit.invoke(submission())).toEqual({ status: "invalid", errors: { [NAME_FIELD]: "invalid" } });
  });

  it("shows the form as unavailable when the record engine refuses without naming a field, and keeps a failed submission for the owner", async () => {
    const { submit, writer, forms, events } = setup();
    writer.invoke.mockResolvedValueOnce(failure(CustomErrorCode.recordWritePaused) as never);

    expect(await submit.invoke(submission())).toEqual({ status: "unavailable" });
    expect(forms.recordFailedSubmission).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ formId: FORM_ID, personRecordId: null, locale: null }),
    );
    expect(forms.recordSubmission).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("keeps no failed submission for answers the visitor can correct", async () => {
    const { submit, writer, forms } = setup();
    writer.invoke.mockResolvedValueOnce(
      failure(CustomErrorCode.recordValueInvalid, ["mutation", "fields", 0, "value"]) as never,
    );

    await submit.invoke(submission());

    expect(forms.recordFailedSubmission).not.toHaveBeenCalled();
  });

  describe("a list that gained a required field after the form was saved", () => {
    const grown = () => {
      const model = createModel();
      return {
        ...model,
        fields: model.fields.map((field) => (field.id === SIZE_FIELD ? { ...field, required: true } : field)),
      };
    };
    const person = {
      typeId: PEOPLE_TYPE_ID,
      relationshipId: RELATION_ID,
      emailLabel: "Email",
      nameLabel: "Name",
      nameFieldId: PERSON_NAME_FIELD,
    };

    it("shows the page as unavailable instead of letting the visitor fill in a form that cannot be saved", async () => {
      const { read } = setup({ model: grown() });

      expect(await read.invoke({ token })).toEqual({ status: "unavailable" });
    });

    it("refuses a submission before a person or a record is created, and keeps it for the owner", async () => {
      const { submit, writer, forms, events } = setup({ config: createConfig({ person }), model: grown() });

      const result = await submit.invoke(submission({ email: "ada@example.com", name: "Ada Lovelace" }));

      expect(result).toEqual({ status: "unavailable" });
      expect(writer.invoke).not.toHaveBeenCalled();
      expect(forms.recordSubmission).not.toHaveBeenCalled();
      expect(forms.recordFailedSubmission).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ formId: FORM_ID, personRecordId: null }),
      );
      expect(events.publish).not.toHaveBeenCalled();
    });

    it("accepts submissions again once the form asks for the field or the field has a default", async () => {
      const model = grown();
      const asked = createConfig({
        fields: [...createConfig().fields, { fieldId: SIZE_FIELD, label: "Team size", helpText: null, required: true }],
      });
      const defaulted = {
        ...model,
        fields: model.fields.map((field) =>
          field.id === SIZE_FIELD
            ? { ...field, behavior: { kind: "input", defaultValue: { kind: "number", value: 1 } } }
            : field,
        ),
      };

      const withQuestion = await setup({ config: asked, model }).submit.invoke(
        submission({ answers: { [NAME_FIELD]: "Ada Lovelace", [SIZE_FIELD]: "12" } }),
      );
      const withDefault = await setup({ model: defaulted as never }).submit.invoke(submission());

      expect(withQuestion.status).toBe("submitted");
      expect(withDefault.status).toBe("submitted");
    });

    it("refuses a submission whose people list no longer qualifies before it creates a person", async () => {
      const model = createModel();
      const unlinked = { ...model, relationships: [] };
      const { submit, read, writer, forms } = setup({ config: createConfig({ person }), model: unlinked as never });

      expect(await read.invoke({ token })).toEqual({ status: "unavailable" });
      expect(await submit.invoke(submission({ email: "ada@example.com" }))).toEqual({ status: "unavailable" });
      expect(writer.invoke).not.toHaveBeenCalled();
      expect(forms.recordFailedSubmission).toHaveBeenCalledTimes(1);
    });
  });

  it("retries once with the new revision when the data model changed meanwhile", async () => {
    const writes: unknown[] = [];
    const { submit, writer, records } = setup({ writes });
    writer.invoke.mockResolvedValueOnce(failure(CustomErrorCode.recordSchemaChanged) as never);
    records.getModel.mockResolvedValueOnce(createModel()).mockResolvedValueOnce(createModel({ revision: 9 }));

    const result = await submit.invoke(submission());

    expect(result.status).toBe("submitted");
    expect(writer.invoke).toHaveBeenCalledTimes(2);
    expect((writes[0] as { expectedRevision: number }).expectedRevision).toBe(9);
  });

  describe("limits", () => {
    it("stops at the monthly cap of the Free plan", async () => {
      const { submit, writer } = setup({ monthly: 50, monthCount: 50 });

      expect(await submit.invoke(submission())).toEqual({ status: "unavailable" });
      expect(writer.invoke).not.toHaveBeenCalled();
    });

    it("accepts a submission below the monthly cap", async () => {
      const { submit } = setup({ monthly: 50, monthCount: 49 });

      expect((await submit.invoke(submission())).status).toBe("submitted");
    });

    it("has no cap without a plan limit", async () => {
      const { submit, forms } = setup({ monthCount: 100_000 });

      expect((await submit.invoke(submission())).status).toBe("submitted");
      expect(forms.countSubmissionsSince).not.toHaveBeenCalled();
    });

    it("limits one visitor per form and hour from the stored submissions", async () => {
      const { submit, writer } = setup({ hourIpCount: PUBLIC_FORM_LIMITS.perIpPerHour });

      expect(await submit.invoke(submission())).toEqual({ status: "rateLimited", retryAfterSeconds: 600 });
      expect(writer.invoke).not.toHaveBeenCalled();
    });

    it("limits the whole form per hour", async () => {
      const { submit } = setup({ hourFormCount: PUBLIC_FORM_LIMITS.perFormPerHour });

      expect((await submit.invoke(submission())).status).toBe("rateLimited");
    });

    it("limits the burst of one visitor in memory", async () => {
      const { submit } = setup({ burst: 2 });
      const results = [];
      for (let attempt = 0; attempt < 3; attempt += 1) results.push(await submit.invoke(submission()));

      expect(results.map((entry) => entry.status)).toEqual(["submitted", "submitted", "rateLimited"]);
      expect((await submit.invoke(submission({ visitor: "198.51.100.7" }))).status).toBe("submitted");
    });
  });

  describe("people", () => {
    const person = {
      typeId: PEOPLE_TYPE_ID,
      relationshipId: RELATION_ID,
      emailLabel: "Email",
      nameLabel: "Your name",
      nameFieldId: PERSON_NAME_FIELD,
    };

    it("links an existing person without creating a second one for the same email", async () => {
      const writes: unknown[] = [];
      const { submit, records } = setup({
        config: createConfig({ person }),
        writes,
        owners: [{ ref: { typeId: PEOPLE_TYPE_ID, recordId: PERSON_ID } }],
      });

      const result = await submit.invoke(submission({ email: "Ada@Example.com", name: "Ada" }));

      expect(result.status).toBe("submitted");
      expect(records.getIdentityOwnersCompanyWide).toHaveBeenCalledWith(
        [{ channelClass: "email", value: "ada@example.com" }],
        [PEOPLE_TYPE_ID],
        { limitPerKey: 1 },
      );
      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({
        mutation: {
          action: "create",
          typeId: TYPE_ID,
          links: [
            { relationId: RELATION_ID, direction: "outgoing", record: { typeId: PEOPLE_TYPE_ID, recordId: PERSON_ID } },
          ],
        },
      });
    });

    it("creates the person by email and links the new record to it", async () => {
      const writes: unknown[] = [];
      const { submit, forms, events } = setup({ config: createConfig({ person }), writes });

      await submit.invoke(submission({ email: "ada@example.com", name: "Ada Lovelace" }));

      expect(writes).toHaveLength(2);
      expect(writes[0]).toMatchObject({
        mutation: {
          action: "create",
          typeId: PEOPLE_TYPE_ID,
          fields: [{ fieldId: PERSON_NAME_FIELD, value: { kind: "text", value: "Ada Lovelace" } }],
          identities: [{ provider: "mail", value: "ada@example.com" }],
        },
      });
      expect(writes[1]).toMatchObject({
        mutation: { typeId: TYPE_ID, links: [{ record: { typeId: PEOPLE_TYPE_ID, recordId: PERSON_ID } }] },
      });
      expect(forms.recordSubmission).toHaveBeenCalledWith(expect.objectContaining({ personRecordId: PERSON_ID }));
      expect(events.publish).toHaveBeenCalledWith(
        DomainEvent.FORM_SUBMITTED,
        expect.objectContaining({ payload: expect.objectContaining({ personRecordId: PERSON_ID }) }),
        expect.anything(),
      );
    });

    it("requires a valid email when the form links a person", async () => {
      const { submit, writer } = setup({ config: createConfig({ person }) });

      expect(await submit.invoke(submission({ email: "nope" }))).toEqual({
        status: "invalid",
        errors: { email: "email" },
      });
      expect(writer.invoke).not.toHaveBeenCalled();
    });

    it("treats a second submission with the same email in a people list as a duplicate", async () => {
      const config = createConfig({
        fields: [
          { fieldId: NAME_FIELD, label: "Name", helpText: null, required: true },
          { fieldId: CONTACT_FIELD, label: "Email", helpText: null, required: true },
        ],
      });
      const { submit, writer, forms } = setup({
        config,
        owners: [{ ref: { typeId: TYPE_ID, recordId: RECORD_ID } }],
      });

      const result = await submit.invoke(
        submission({ answers: { [NAME_FIELD]: "Ada", [CONTACT_FIELD]: "ada@example.com" } }),
      );

      expect(result.status).toBe("submitted");
      expect(writer.invoke).not.toHaveBeenCalled();
      expect(forms.recordSubmission).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "duplicate", recordId: RECORD_ID, personRecordId: RECORD_ID }),
      );
    });

    it("keeps what a duplicate answered on the submission, linked to the existing record, and still emits the event", async () => {
      const config = createConfig({
        fields: [
          { fieldId: NAME_FIELD, label: "Your name", helpText: null, required: true },
          { fieldId: CONTACT_FIELD, label: "Email", helpText: null, required: true },
        ],
      });
      const { submit, forms, events } = setup({
        config,
        owners: [{ ref: { typeId: TYPE_ID, recordId: RECORD_ID } }],
      });

      await submit.invoke(submission({ answers: { [NAME_FIELD]: "Ada", [CONTACT_FIELD]: "ada@example.com" } }));

      expect(forms.recordSubmission).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: "duplicate",
          recordId: RECORD_ID,
          answers: [
            { fieldId: NAME_FIELD, label: "Your name", value: "Ada" },
            { fieldId: CONTACT_FIELD, label: "Email", value: "ada@example.com" },
          ],
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        DomainEvent.FORM_SUBMITTED,
        expect.objectContaining({
          payload: expect.objectContaining({ outcome: "duplicate", recordId: null, personRecordId: RECORD_ID }),
        }),
        { systemCompanyId: COMPANY_ID },
      );
    });

    it("stores no answers on the submission of a record it created, because the record holds them", async () => {
      const { submit, forms } = setup();

      await submit.invoke(submission());

      expect(forms.recordSubmission).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "created", recordId: RECORD_ID, answers: null }),
      );
    });
  });

  describe("availability", () => {
    it.each([
      ["a link signed with another secret", { token: publicFormToken(FORM_ID, "another") }, {}],
      ["a form that is turned off", {}, { form: { enabled: false } }],
      ["a workspace that turned public links off", {}, { company: { allowPublicLinks: false } }],
      ["a workspace being deleted", {}, { company: { deletingAt: now } }],
      ["a list in Trash", {}, { type: { archived: true } }],
      ["a stored definition that no longer parses", {}, { form: { config: { title: "" } } }],
      ["a creator who left or lost the permission", {}, { allowed: false }],
    ])("answers unavailable for %s", async (_name, input, options) => {
      const { submit, writer } = setup(options as Setup);

      expect(await submit.invoke(submission(input))).toEqual({ status: "unavailable" });
      expect(writer.invoke).not.toHaveBeenCalled();
    });

    it("answers unavailable when the list is not in the data model any more", async () => {
      const { submit } = setup({ model: createModel({ types: [] }) });

      expect(await submit.invoke(submission())).toEqual({ status: "unavailable" });
    });

    it("rejects a malformed link before anything is looked up", async () => {
      const { submit, writer } = setup();

      expect(await submit.invoke(submission({ token: "abc" }))).toEqual({ status: "invalid", errors: {} });
      expect(writer.invoke).not.toHaveBeenCalled();
    });

    it("rejects a body that does not match the schema", async () => {
      const { submit } = setup();

      expect(await submit.invoke({ ...submission(), answers: { "not-a-uuid": "x" } })).toEqual({
        status: "invalid",
        errors: {},
      });
    });

    it("rejects an answer longer than the limit and more answers than the form has fields", async () => {
      const { submit, writer } = setup();
      const tooLong = { [NOTES_FIELD]: "x".repeat(ANSWER_LIMITS.maxRichTextChars + 1) };
      const tooMany = Object.fromEntries(
        Array.from({ length: PUBLIC_FORM_LIMITS.maxFields + 1 }, (_, index) => [fieldUuid(index), "x"]),
      );

      expect(await submit.invoke(submission({ answers: tooLong }))).toEqual({ status: "invalid", errors: {} });
      expect(await submit.invoke(submission({ answers: tooMany }))).toEqual({ status: "invalid", errors: {} });
      expect(writer.invoke).not.toHaveBeenCalled();
    });

    it("accepts an answer exactly at the limit", async () => {
      const { submit } = setup();

      const result = await submit.invoke(
        submission({ answers: { [NAME_FIELD]: "Ada", [NOTES_FIELD]: "x".repeat(ANSWER_LIMITS.maxRichTextChars) } }),
      );

      expect(result.status).toBe("submitted");
    });
  });

  describe("answer caps in the schema", () => {
    const base = { token, renderToken: "r" };

    it("caps each string, each list entry and the number of answers", () => {
      const parse = (answers: Record<string, unknown>) =>
        SubmitPublicFormSchema.safeParse({ ...base, answers }).success;
      const atLimit = "x".repeat(ANSWER_LIMITS.maxRichTextChars);

      expect(parse({ [NAME_FIELD]: atLimit })).toBe(true);
      expect(parse({ [NAME_FIELD]: `${atLimit}x` })).toBe(false);
      expect(parse({ [NAME_FIELD]: [atLimit] })).toBe(true);
      expect(parse({ [NAME_FIELD]: [`${atLimit}x`] })).toBe(false);
      expect(parse({ [NAME_FIELD]: true })).toBe(true);
      const keys = (count: number) =>
        Object.fromEntries(Array.from({ length: count }, (_, index) => [fieldUuid(index), "x"]));
      expect(parse(keys(PUBLIC_FORM_LIMITS.maxFields))).toBe(true);
      expect(parse(keys(PUBLIC_FORM_LIMITS.maxFields + 1))).toBe(false);
    });
  });
});

describe("ReadPublicFormInteractor", () => {
  it("returns what the page needs and a render token, but no ids of the list or the company", async () => {
    const { read } = setup({ monthly: 50 });

    const result = await read.invoke({ token, visitor: "203.0.113.9" });

    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.form).toMatchObject({
      title: "Contact us",
      submitLabel: "Send",
      workspaceName: "Acme",
      badge: true,
      renderToken: expect.stringMatching(/^\d+\.[0-9a-f]{16}\.[0-9a-f]{64}$/u),
    });
    expect(renderTokenIssuedTo(result.form.renderToken, "203.0.113.9", SECRET)).toBe(true);
    expect(renderTokenIssuedTo(result.form.renderToken, "198.51.100.7", SECRET)).toBe(false);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(COMPANY_ID);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain(TYPE_ID);
  });

  it("answers unavailable for a malformed link", async () => {
    expect(await setup().read.invoke({ token: "abc" })).toEqual({ status: "unavailable" });
  });

  it("shows no badge outside the Free plan", async () => {
    const { read } = setup();
    const result = await read.invoke({ token });

    expect(result.status === "available" && result.form.badge).toBe(false);
  });

  it("is unavailable for a disabled form and rate limited for a visitor that reloads too fast", async () => {
    expect(await setup({ form: { enabled: false } }).read.invoke({ token })).toEqual({ status: "unavailable" });

    const limited = new TokenBucketRateLimiter(1, 60_000);
    const access = new PublicFormAccess(
      {
        findFormUnscoped: () => Promise.resolve({ enabled: true, company: { allowPublicLinks: true }, type: {} }),
      } as never,
      {
        run: (_id: string, _read: () => Promise<unknown>, unavailable: () => Promise<unknown>) => unavailable(),
      } as never,
      { view: limited, visitorSubmit: limited, formSubmit: limited },
      { authSecret: SECRET, now: () => now },
    );
    const limitedRead = new ReadPublicFormInteractor(access, {} as never, {} as never, UNLIMITED_PUBLIC_FORM_QUOTA);

    await limitedRead.invoke({ token, visitor: "v" });
    expect(await limitedRead.invoke({ token, visitor: "v" })).toMatchObject({ status: "rateLimited" });
  });
});
