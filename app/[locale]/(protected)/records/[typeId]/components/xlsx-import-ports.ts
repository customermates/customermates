import type { XlsxWizardPorts } from "./xlsx-import-wizard.store";

import { getUsersAction } from "@/app/[locale]/(protected)/settings/(workspace)/actions";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { getRecordChoicesAction, importRecordsAction, queryRecordsAction } from "../../actions";
import { actionData } from "@/core/utils/action-data";

const FATAL_CODES = new Set([
  "recordSchemaChanged",
  "recordWritePaused",
  "recordTypeNotFound",
  "recordIdempotencyConflict",
]);

type ErrorNode = { errors?: unknown; properties?: Record<string, unknown>; items?: unknown[] };

export function firstErrorMessage(tree: unknown): string | null {
  if (!tree || typeof tree !== "object") return null;
  const node = tree as ErrorNode;
  if (Array.isArray(node.errors)) {
    const message = node.errors.find((entry): entry is string => typeof entry === "string" && entry.length > 0);
    if (message) return message;
  }
  for (const child of [...Object.values(node.properties ?? {}), ...(node.items ?? [])]) {
    const message = firstErrorMessage(child);
    if (message) return message;
  }
  return null;
}

export function xlsxImportPorts(fallbackMessage: string): XlsxWizardPorts {
  return {
    queryRecords: async (query) => {
      const result = await queryRecordsAction(query);
      if (result.ok) return { ok: true, data: result.data };
      notifyIfWorkspaceChanged(result);
      return { ok: false };
    },
    listMembers: async (page, pageSize) => {
      const result = await actionData(getUsersAction({ pagination: { page, pageSize } }));
      return {
        members: result.items.map((user) => ({
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
        })),
        totalPages: result.pagination?.totalPages ?? 1,
      };
    },
    listChoices: async (typeId, page, pageSize) => {
      const result = await getRecordChoicesAction({ typeId, page, pageSize });
      if (result.ok) return { ok: true, data: { records: result.data.records, total: result.data.total } };
      notifyIfWorkspaceChanged(result);
      return { ok: false };
    },
    importRecords: async (input) => {
      try {
        const result = await importRecordsAction(input);
        if (result.ok) return { ok: true, data: result.data };
        return {
          ok: false,
          message: firstErrorMessage(result.error) ?? fallbackMessage,
          fatal: notifyIfWorkspaceChanged(result) || FATAL_CODES.has(result.code ?? ""),
        };
      } catch (error) {
        notifyIfWorkspaceChanged(error);
        return { ok: false, message: fallbackMessage, fatal: true };
      }
    },
  };
}
