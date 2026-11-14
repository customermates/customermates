"use client";

import type { FormEvent } from "react";
import type { PublicBookingPage, PublicBookingSubmitResult, PublicQuestion } from "@/ee/calendar/booking.schema";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarCheck, Clock, Video } from "lucide-react";

import { readPublicBookingSlotsAction, submitPublicBookingAction } from "./actions";

import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { browserTimeZone } from "@/core/utils/time-zone";
import { calendarDateOf } from "@/features/record-calendar/calendar-date";
import { zonedDate } from "@/features/record-calendar/zoned-time";

type Slot = { startsAt: string; endsAt: string };
type AnswerValue = string | number | boolean;
type Confirmed = Extract<PublicBookingSubmitResult, { status: "booked" }>;

const SLOT_DAYS = 31;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full w-full bg-background" id="public-booking">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 md:px-8 md:py-10">{children}</main>
    </div>
  );
}

export function PublicBookingUnavailable({ rateLimited }: { rateLimited: boolean }) {
  const t = useTranslations();

  return (
    <Frame>
      <Alert
        description={rateLimited ? t("PublicBooking.rateLimited") : t("PublicBooking.unavailable")}
        role="status"
        variant="warning"
      />
    </Frame>
  );
}

function QuestionField({
  question,
  value,
  invalid,
  onChange,
}: {
  question: PublicQuestion;
  value: AnswerValue | undefined;
  invalid: boolean;
  onChange: (value: AnswerValue | undefined) => void;
}) {
  const id = `booking-question-${question.fieldId}`;
  const label = (
    <Label htmlFor={id}>
      {question.label}

      {question.required ? <span className="text-destructive"> *</span> : null}
    </Label>
  );

  if (question.kind === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          aria-invalid={invalid}
          checked={value === true}
          id={id}
          onCheckedChange={(checked) => onChange(checked === true)}
        />

        {label}
      </div>
    );
  }

  if (question.kind === "select") {
    return (
      <div className="space-y-1.5">
        {label}

        <Select value={typeof value === "string" ? value : ""} onValueChange={(next) => onChange(next)}>
          <SelectTrigger aria-invalid={invalid} id={id}>
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            {question.options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (question.kind === "text") {
    return (
      <div className="space-y-1.5">
        {label}

        <Textarea
          aria-invalid={invalid}
          id={id}
          maxLength={2000}
          rows={2}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {label}

      <Input
        aria-invalid={invalid}
        id={id}
        type={question.kind === "number" ? "number" : question.kind === "date" ? "date" : "url"}
        value={value === undefined ? "" : String(value)}
        onChange={(event) =>
          onChange(
            question.kind === "number"
              ? event.target.value === ""
                ? undefined
                : Number(event.target.value)
              : event.target.value,
          )
        }
      />
    </div>
  );
}

export function PublicBookingView({ page, token }: { page: PublicBookingPage; token: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [invalid, setInvalid] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<"slotTaken" | "unavailable" | "rateLimited" | null>(null);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);

  useEffect(() => setTimeZone(browserTimeZone()), []);

  const loadSlots = useCallback(async () => {
    setLoadFailed(false);
    try {
      const result = await readPublicBookingSlotsAction({ token, days: SLOT_DAYS });
      if (result.status === "available") setSlots(result.slots);
      else setLoadFailed(true);
    } catch {
      setLoadFailed(true);
    }
  }, [token]);

  useEffect(() => {
    void loadSlots().catch(reportApplicationError);
  }, [loadSlots]);

  const byDate = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    if (!timeZone) return groups;
    for (const item of slots ?? []) {
      const key = zonedDate(item.startsAt, timeZone);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return groups;
  }, [slots, timeZone]);

  const dayLabel = useMemo(
    () => (iso: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: timeZone ?? "UTC" }).format(
        new Date(iso),
      ),
    [locale, timeZone],
  );
  const timeLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: timeZone ?? "UTC" }).format(
      new Date(iso),
    );

  const selectedDate = date ?? (byDate.size ? [...byDate.keys()][0] : null);
  const daySlots = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot || !timeZone || submitting) return;

    setSubmitting(true);
    setProblem(null);
    setInvalid([]);
    try {
      const result = await submitPublicBookingAction({
        token,
        startsAt: slot.startsAt,
        name,
        email,
        timeZone,
        answers,
        website,
      });
      if (result.status === "booked") setConfirmed(result);
      else if (result.status === "invalid") setInvalid(result.fields);
      else {
        setProblem(result.status);
        if (result.status === "slotTaken") {
          setSlot(null);
          await loadSlots();
        }
      }
    } catch {
      setProblem("unavailable");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <Frame>
        <div className="flex flex-col gap-3" data-booking-confirmed="">
          <CalendarCheck aria-hidden className="size-8 text-success" />

          <h1 className="text-2xl font-semibold tracking-tight">{t("PublicBooking.confirmedTitle")}</h1>

          <p className="text-sm">{confirmed.title}</p>

          <p className="text-sm text-muted-foreground">{dayLabel(confirmed.startsAt)}</p>

          {confirmed.conferenceUrl ? (
            <a
              className="text-sm text-primary underline"
              href={confirmed.conferenceUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("PublicBooking.joinLink")}
            </a>
          ) : null}

          <p className="text-sm text-muted-foreground">
            {confirmed.successMessage ?? t("PublicBooking.confirmedText")}
          </p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {page.workspaceName ? `${page.hostName} · ${page.workspaceName}` : page.hostName}
        </p>

        <h1 className="text-2xl font-semibold tracking-tight" id="public-booking-title">
          {page.title}
        </h1>

        <p className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock aria-hidden className="size-4" />

            {t("PublicBooking.minutes", { minutes: page.durationMinutes })}
          </span>

          {page.withVideo ? (
            <span className="flex items-center gap-1">
              <Video aria-hidden className="size-4" />

              {t("PublicBooking.video")}
            </span>
          ) : null}
        </p>

        {page.description ? <p className="whitespace-pre-line text-sm">{page.description}</p> : null}
      </div>

      {loadFailed ? <Alert description={t("PublicBooking.loadFailed")} role="alert" variant="destructive" /> : null}

      {problem ? (
        <Alert
          description={
            problem === "slotTaken"
              ? t("PublicBooking.problem.slotTaken")
              : problem === "rateLimited"
                ? t("PublicBooking.problem.rateLimited")
                : t("PublicBooking.problem.unavailable")
          }
          role="alert"
          variant="warning"
        />
      ) : null}

      {slots === null && !loadFailed ? (
        <div className="flex justify-center py-8">
          <Spinner aria-label={t("Loading.text")} className="size-5" />
        </div>
      ) : null}

      {slots && !slots.length && !loadFailed ? (
        <p className="text-sm text-muted-foreground">{t("PublicBooking.noSlots")}</p>
      ) : null}

      {slots?.length && timeZone ? (
        <div className="grid gap-6 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col gap-2">
            <Calendar
              disabled={(day) => !byDate.has(calendarDateOf(day.getFullYear(), day.getMonth() + 1, day.getDate()))}
              mode="single"
              selected={
                selectedDate
                  ? new Date(
                      Number(selectedDate.slice(0, 4)),
                      Number(selectedDate.slice(5, 7)) - 1,
                      Number(selectedDate.slice(8, 10)),
                    )
                  : undefined
              }
              onSelect={(day) => {
                if (!day) return;
                setDate(calendarDateOf(day.getFullYear(), day.getMonth() + 1, day.getDate()));
                setSlot(null);
              }}
            />

            <p className="text-xs text-muted-foreground">{t("PublicBooking.timeZone", { timeZone })}</p>
          </div>

          <div className="flex flex-col gap-2" data-booking-slots="">
            <div className="flex flex-wrap gap-2">
              {daySlots.map((item) => (
                <Button
                  key={item.startsAt}
                  size="sm"
                  type="button"
                  variant={slot?.startsAt === item.startsAt ? "default" : "secondary"}
                  onClick={() => setSlot(item)}
                >
                  {timeLabel(item.startsAt)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {slot ? (
        <form
          className="flex flex-col gap-4"
          data-booking-form=""
          onSubmit={(event) => runUserAction(() => submit(event))}
        >
          <p className="text-sm font-medium">{dayLabel(slot.startsAt)}</p>

          <div className="space-y-1.5">
            <Label htmlFor="booking-name">
              {t("PublicBooking.name")}

              <span className="text-destructive"> *</span>
            </Label>

            <Input
              required
              aria-invalid={invalid.includes("name")}
              autoComplete="name"
              id="booking-name"
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="booking-email">
              {t("PublicBooking.email")}

              <span className="text-destructive"> *</span>
            </Label>

            <Input
              required
              aria-invalid={invalid.includes("email")}
              autoComplete="email"
              id="booking-email"
              maxLength={320}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          {page.questions.map((question) => (
            <QuestionField
              key={question.fieldId}
              invalid={invalid.includes(question.fieldId)}
              question={question}
              value={answers[question.fieldId]}
              onChange={(value) =>
                setAnswers((current) => {
                  const others = Object.fromEntries(
                    Object.entries(current).filter(([fieldId]) => fieldId !== question.fieldId),
                  );
                  return value === undefined ? others : { ...others, [question.fieldId]: value };
                })
              }
            />
          ))}

          <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
            <label htmlFor="booking-website">{t("PublicBooking.honeypot")}</label>

            <input
              autoComplete="off"
              id="booking-website"
              name="website"
              tabIndex={-1}
              type="text"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          <Button disabled={submitting} type="submit">
            {submitting ? <Spinner aria-label={t("Loading.text")} className="size-4" /> : null}

            {t("PublicBooking.confirm")}
          </Button>
        </form>
      ) : null}
    </Frame>
  );
}
