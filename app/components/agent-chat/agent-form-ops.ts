import type { BaseFormStore } from "@/core/base/base-form.store";
import type { RootStore } from "@/core/stores/root.store";

export type AgentFormStore = BaseFormStore<Record<string, unknown>> & {
  customColumns?: { id: string; label: string; type: string; options?: unknown }[];
};

export function resolveFormStore(root: RootStore, form: string): AgentFormStore | null {
  switch (form) {
    case "contact":
      return root.contactDetailStore as unknown as AgentFormStore;
    case "organization":
      return root.organizationDetailStore as unknown as AgentFormStore;
    case "deal":
      return root.dealDetailStore as unknown as AgentFormStore;
    case "service":
      return root.serviceDetailStore as unknown as AgentFormStore;
    case "task":
      return root.taskDetailStore as unknown as AgentFormStore;
    case "member":
      return root.userModalStore as unknown as AgentFormStore;
    case "webhook":
      return root.webhookModalStore as unknown as AgentFormStore;
    case "widget":
      return root.widgetModalStore as unknown as AgentFormStore;
    case "profile-settings":
      return root.profileSettingsStore as unknown as AgentFormStore;
    case "company-settings":
      return root.companySettingsStore as unknown as AgentFormStore;
    default:
      return null;
  }
}

const normalize = (value: string) => value.trim().toLowerCase();

function leafPaths(value: unknown, prefix: string, into: string[]) {
  if (value === null || typeof value !== "object") {
    if (prefix) into.push(prefix);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => leafPaths(item, `${prefix}[${index}]`, into));
    return;
  }
  for (const [key, child] of Object.entries(value)) leafPaths(child, prefix ? `${prefix}.${key}` : key, into);
}

export function enumerateFormFields(store: AgentFormStore): string[] {
  const paths: string[] = [];
  leafPaths(store.form, "", paths);
  return paths;
}

type FieldResolution = { ok: true; path: string; value: unknown } | { ok: false; message: string };

function coerce(current: unknown, raw: string): unknown {
  if (typeof current === "boolean") {
    const lowered = normalize(raw);
    if (["true", "yes", "on", "1"].includes(lowered)) return true;
    if (["false", "no", "off", "0"].includes(lowered)) return false;
    return current;
  }
  if (typeof current === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : current;
  }
  return raw;
}

export function resolveFormField(store: AgentFormStore, field: string, rawValue: string): FieldResolution {
  const wanted = normalize(field);
  const paths = enumerateFormFields(store);

  const direct = paths.find((path) => normalize(path) === wanted);
  const bySegment = direct ?? paths.find((path) => normalize(path.split(".").at(-1) ?? path) === wanted);
  if (bySegment) {
    const current = store.getValue(bySegment);
    if (typeof current === "object" && current !== null)
      return { ok: false, message: `The field "${field}" can't be filled by the assistant yet.` };
    return { ok: true, path: bySegment, value: coerce(current, rawValue) };
  }

  const columns = store.customColumns ?? [];
  const columnIndex = columns.findIndex((column) => normalize(column.label) === wanted);
  if (columnIndex >= 0) {
    const column = columns[columnIndex];
    const path = `customFieldValues[${columnIndex}].value`;
    if (column.type === "singleSelect") {
      const options = (column.options as { options?: { value: string; label: string }[] } | undefined)?.options ?? [];
      const option = options.find(
        (candidate) => normalize(candidate.label) === normalize(rawValue) || candidate.value === rawValue,
      );
      if (!option) {
        const available = options.map((candidate) => candidate.label).join(", ");
        return { ok: false, message: `"${rawValue}" is not an option for "${field}". Options: ${available}.` };
      }
      return { ok: true, path, value: option.value };
    }
    return { ok: true, path, value: coerce(store.getValue(path), rawValue) };
  }

  const available = paths
    .filter((path) => {
      const value = store.getValue(path);
      return value === null || typeof value !== "object";
    })
    .slice(0, 20)
    .join(", ");
  return { ok: false, message: `No field named "${field}" on this form. Fields: ${available}.` };
}
