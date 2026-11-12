"use client";

import type { PublicFormFieldError, PublicFormView } from "@/features/public-form/public-form.schema";
import type { FormValue } from "./public-form-state";

import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

type Field = PublicFormView["fields"][number];

type Props = {
  field: Field;
  value: FormValue | undefined;
  error: PublicFormFieldError | undefined;
  disabled: boolean;
  onChange: (value: FormValue) => void;
};

type ControlProps = Pick<Props, "field" | "value" | "disabled" | "onChange"> & {
  id: string;
  invalid: boolean;
  describedBy: string | undefined;
};

function textOf(value: FormValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function InputControl({ field, value, disabled, onChange, id, invalid, describedBy }: ControlProps) {
  const type = field.valueType === "url" ? "url" : field.valueType === "date" ? "date" : "text";
  const numeric = field.valueType === "number" || field.valueType === "currency";

  return (
    <Input
      aria-describedby={describedBy}
      aria-invalid={invalid}
      aria-required={field.required}
      autoComplete="off"
      disabled={disabled}
      id={id}
      inputMode={numeric ? "decimal" : undefined}
      name={id}
      type={type}
      value={textOf(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function ChoiceControl({ field, value, disabled, onChange, id, invalid, describedBy }: ControlProps) {
  if (field.multiple) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div aria-describedby={describedBy} className="flex flex-col gap-2" id={id} role="group">
        {field.options.map((option) => (
          <div key={option.id} className="flex items-center gap-2">
            <Checkbox
              checked={selected.includes(option.id)}
              disabled={disabled}
              id={`${id}-${option.id}`}
              onCheckedChange={(checked) =>
                onChange(checked === true ? [...selected, option.id] : selected.filter((entry) => entry !== option.id))
              }
            />

            <Label htmlFor={`${id}-${option.id}`}>{option.label}</Label>
          </div>
        ))}
      </div>
    );
  }

  return (
    <RadioGroup
      aria-describedby={describedBy}
      aria-invalid={invalid}
      disabled={disabled}
      id={id}
      value={textOf(value)}
      onValueChange={onChange}
    >
      {field.options.map((option) => (
        <div key={option.id} className="flex items-center gap-2">
          <RadioGroupItem id={`${id}-${option.id}`} value={option.id} />

          <Label htmlFor={`${id}-${option.id}`}>{option.label}</Label>
        </div>
      ))}
    </RadioGroup>
  );
}

function BooleanControl({ field, value, disabled, onChange, id, invalid, describedBy }: ControlProps) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        aria-describedby={describedBy}
        aria-invalid={invalid}
        checked={value === true}
        disabled={disabled}
        id={id}
        onCheckedChange={(checked) => onChange(checked === true)}
      />

      <Label className="leading-snug" htmlFor={id}>
        {field.label}
      </Label>
    </div>
  );
}

function Control(props: ControlProps) {
  const { field } = props;
  if (field.valueType === "boolean") return <BooleanControl {...props} />;
  if (field.valueType === "select") return <ChoiceControl {...props} />;
  if (field.valueType === "richText")
    return (
      <Textarea
        aria-describedby={props.describedBy}
        aria-invalid={props.invalid}
        aria-required={field.required}
        disabled={props.disabled}
        id={props.id}
        name={props.id}
        rows={4}
        value={textOf(props.value)}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  return <InputControl {...props} />;
}

export function PublicFormFieldInput({ field, value, error, disabled, onChange }: Props) {
  const t = useTranslations();
  const id = `public-form-field-${field.fieldId}`;
  const describedBy = [field.helpText ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  const errorText =
    error === "required"
      ? t("PublicForm.errors.required")
      : error === "email"
        ? t("PublicForm.errors.email")
        : error
          ? t("PublicForm.errors.invalid")
          : null;

  return (
    <div className="flex flex-col gap-1.5" data-field-id={field.fieldId}>
      {field.valueType === "boolean" ? null : (
        <Label htmlFor={field.valueType === "select" && !field.multiple ? undefined : id} id={`${id}-label`}>
          {field.label}

          {field.required ? (
            <span aria-hidden className="text-destructive">
              *
            </span>
          ) : null}
        </Label>
      )}

      <Control
        describedBy={describedBy || undefined}
        disabled={disabled}
        field={field}
        id={id}
        invalid={Boolean(error)}
        value={value}
        onChange={onChange}
      />

      {field.helpText ? (
        <p className="text-xs text-muted-foreground" id={`${id}-help`}>
          {field.helpText}
        </p>
      ) : null}

      {errorText ? (
        <p className="text-xs text-destructive" id={`${id}-error`} role="alert">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}
