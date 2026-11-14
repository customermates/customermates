import type { z } from "zod";

import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordModel, RecordRef } from "@/features/records/record-model.schema";
import type { RecordRepo } from "@/features/records/record.repo";
import type { EventService } from "@/features/event/event.service";
import type { PublicFormAccess } from "./public-form-access";
import type { AcceptedFormAnswers } from "./public-form-answers";
import type { PublicFormLookup } from "./public-form-lookup.repo";
import type { FormRecordWriter } from "./public-form-person";
import type { PublicFormQuota } from "./public-form-quota";
import type { PublicFormRepo } from "./public-form.repo";
import type { PublicFormConfig, PublicFormSubmitResult, SubmitPublicFormInput } from "./public-form.schema";

import { randomUUID } from "node:crypto";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import * as ErrorReporter from "@/core/observability/server";
import { DomainEvent } from "@/features/event/domain-events";
import { isAppLocale } from "@/i18n/locale-registry";

import { PUBLIC_FORM_UNAVAILABLE } from "./public-form-access";
import { buildFormAnswers, mutationFieldErrors } from "./public-form-answers";
import { PUBLIC_FORM_LIMITS } from "./public-form-limits";
import { createPerson, findPersonByEmail, linkDirection } from "./public-form-person";
import { startOfUtcMonth } from "./public-form-quota";
import { renderTokenAgeMs, visitorHash } from "./public-form-render-token";
import { SubmitPublicFormSchema } from "./public-form.schema";

type Submission = z.infer<typeof SubmitPublicFormSchema>;

type Context = {
  form: PublicFormLookup;
  config: PublicFormConfig;
  data: Submission;
  ipHash: string | null;
  now: Date;
  submissionId: string;
};

type FormLink = { relationId: string; direction: "outgoing" | "incoming"; record: RecordRef };

type Created = { status: "created"; recordId: string | null } | { status: "failed"; result: PublicFormSubmitResult };

const HOUR_MS = 60 * 60_000;

@SystemInteractor
export class SubmitPublicFormInteractor {
  constructor(
    private access: PublicFormAccess,
    private forms: PublicFormRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private writer: FormRecordWriter,
    private events: Pick<EventService, "publish">,
    private quota: PublicFormQuota,
  ) {}

  async invoke(input: SubmitPublicFormInput & { visitor?: string | null }): Promise<PublicFormSubmitResult> {
    const { visitor, ...rest } = input;
    const parsed = SubmitPublicFormSchema.safeParse(rest);
    if (!parsed.success) return { status: "invalid", errors: {} };
    const data = parsed.data;
    return this.access.open(data.token, visitor, "submit", (form, config) =>
      this.submit({
        form,
        config,
        data,
        ipHash: visitorHash(visitor, this.access.authSecret),
        now: this.access.now(),
        submissionId: randomUUID(),
      }),
    );
  }

  private accepted(config: PublicFormConfig): PublicFormSubmitResult {
    return { status: "submitted", message: config.success.message, redirectUrl: config.success.redirectUrl };
  }

  private looksAutomated({ form, data, now }: Context): boolean {
    if (data.website) return true;
    const age = renderTokenAgeMs(data.renderToken, form.id, now, this.access.authSecret);
    return age === null || age < PUBLIC_FORM_LIMITS.minFillMs || age > PUBLIC_FORM_LIMITS.maxFillMs;
  }

  private async overLimit({ form, ipHash, now }: Context): Promise<PublicFormSubmitResult | null> {
    const limits = await this.quota.limits(form.companyId);
    if (limits.submissionsPerMonth !== null) {
      const used = await this.forms.countSubmissionsSince(startOfUtcMonth(now));
      if (used >= limits.submissionsPerMonth) return PUBLIC_FORM_UNAVAILABLE;
    }
    const since = new Date(now.getTime() - HOUR_MS);
    const [forIp, forForm] = await Promise.all([
      ipHash ? this.forms.countFormSubmissionsSince(form.id, since, ipHash) : Promise.resolve(0),
      this.forms.countFormSubmissionsSince(form.id, since),
    ]);
    const exceeded = forIp >= PUBLIC_FORM_LIMITS.perIpPerHour || forForm >= PUBLIC_FORM_LIMITS.perFormPerHour;
    return exceeded ? { status: "rateLimited", retryAfterSeconds: 600 } : null;
  }

  private async submit(context: Context): Promise<PublicFormSubmitResult> {
    const { form, config, data } = context;
    if (this.looksAutomated(context)) return this.accepted(config);

    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    const typeExists = model.types.some((entry) => entry.id === form.typeId && !entry.archived);
    if (!policy.actor || !policy.allowed(form.typeId, "create") || !typeExists) return PUBLIC_FORM_UNAVAILABLE;

    const blocked = await this.overLimit(context);
    if (blocked) return blocked;

    const built = buildFormAnswers(config, form.typeId, model.fields, data);
    const consentMissing = config.consent !== null && data.consent !== true;
    if (!built.ok || consentMissing) {
      return {
        status: "invalid",
        errors: { ...(built.ok ? {} : built.errors), ...(consentMissing ? { consent: "consent" } : {}) },
      };
    }
    return this.persist(context, model, built);
  }

  private async persist(
    context: Context,
    model: RecordModel,
    built: AcceptedFormAnswers,
  ): Promise<PublicFormSubmitResult> {
    const { form, config } = context;
    const identity = built.identities[0];
    const duplicate = identity ? await findPersonByEmail(this.records, form.typeId, identity.value) : null;
    if (duplicate) {
      await this.finish(context, built, "duplicate", null, duplicate);
      return this.accepted(config);
    }

    const person = await this.resolvePerson(context, model, built);
    if (person === false) return PUBLIC_FORM_UNAVAILABLE;
    const links = this.personLinks(config, model, form.typeId, person);
    if (!links) return PUBLIC_FORM_UNAVAILABLE;

    const created = await this.createRecord(context, model, built, links);
    if (created.status === "failed") return created.result;
    await this.finish(context, built, "created", created.recordId, person);
    return this.accepted(config);
  }

  private personLinks(
    config: PublicFormConfig,
    model: RecordModel,
    typeId: string,
    person: RecordRef | null,
  ): FormLink[] | null {
    if (!person || !config.person) return [];
    const direction = linkDirection(model, config.person, typeId);
    return direction ? [{ relationId: config.person.relationshipId, direction, record: person }] : null;
  }

  private async resolvePerson(
    { form, config, submissionId }: Context,
    model: RecordModel,
    built: AcceptedFormAnswers,
  ): Promise<RecordRef | null | false> {
    if (!config.person || !built.email) return null;
    const existing = await findPersonByEmail(this.records, config.person.typeId, built.email);
    if (existing) return existing;
    if (!linkDirection(model, config.person, form.typeId)) return false;
    const created = await createPerson(
      this.writer,
      model.revision,
      config.person,
      built.email,
      built.name,
      `form:${submissionId}:person`,
    );
    return created ?? false;
  }

  private async createRecord(
    context: Context,
    model: RecordModel,
    built: AcceptedFormAnswers,
    links: FormLink[],
  ): Promise<Created> {
    const { form, submissionId } = context;
    const attempt = (revision: number) =>
      this.writer.invoke({
        expectedRevision: revision,
        idempotencyKey: `form:${submissionId}`,
        mutation: {
          action: "create",
          typeId: form.typeId,
          fields: built.fields,
          ...(built.identities.length > 0 ? { identities: built.identities } : {}),
          ...(links.length > 0 ? { links } : {}),
        },
      });
    let result = await attempt(model.revision);
    const stale = (issues: ReadonlyArray<{ code: string; params?: Record<string, unknown> }>) =>
      issues.some((issue) => issue.code === "custom" && issue.params?.error === CustomErrorCode.recordSchemaChanged);
    if (!result.ok && stale(result.error.issues)) result = await attempt((await this.records.getModel()).revision);

    if (result.ok) {
      const ref =
        result.data.status === "completed" ? result.data.refs.find((entry) => entry.typeId === form.typeId) : undefined;
      return { status: "created", recordId: ref?.recordId ?? null };
    }
    const errors = mutationFieldErrors(built.fields, result.error.issues);
    return {
      status: "failed",
      result: Object.keys(errors).length > 0 ? { status: "invalid", errors } : PUBLIC_FORM_UNAVAILABLE,
    };
  }

  private async finish(
    context: Context,
    built: AcceptedFormAnswers,
    outcome: "created" | "duplicate",
    recordId: string | null,
    person: RecordRef | null,
  ): Promise<void> {
    const { form, config, data, ipHash, now, submissionId } = context;
    await this.forms.recordSubmission({
      id: submissionId,
      formId: form.id,
      outcome,
      recordId,
      personRecordId: person?.recordId ?? null,
      ipHash,
      locale: isAppLocale(data.locale) ? data.locale : config.locale,
      consent: config.consent ? { text: config.consent.text, version: form.consentVersion, at: now } : null,
    });
    await this.events
      .publish(
        DomainEvent.FORM_SUBMITTED,
        {
          entityId: submissionId,
          payload: {
            source: "form",
            formId: form.id,
            formName: form.name,
            typeId: form.typeId,
            submissionId,
            outcome,
            recordId,
            personRecordId: person?.recordId ?? null,
            answers: built.display,
          },
        },
        { systemCompanyId: form.companyId },
      )
      .catch((error: unknown) => {
        ErrorReporter.captureException(error, { tags: { kind: "form-submitted-event", companyId: form.companyId } });
      });
  }
}
