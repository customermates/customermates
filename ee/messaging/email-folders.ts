import { z } from "zod";

export const EmailFolderSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  role: z.string().nullable(),
  totalCount: z.number().nullable(),
  unreadCount: z.number().nullable(),
});
export type EmailFolder = z.infer<typeof EmailFolderSchema>;

type FolderLike = {
  id?: string;
  role?: string | null;
  name?: string | null;
  total_count?: number | null;
  unread_count?: number | null;
};

const SKIPPED_FOLDER_ROLES = new Set(["TRASH", "JUNK", "SPAM", "DRAFTS", "ALL"]);
const SKIPPED_FOLDER_NAME_KEYWORDS = ["junk", "spam", "trash", "deleted", "draft", "outbox"];

export function isSkippedEmailFolder(folder: { role?: string | null; name?: string | null }): boolean {
  const role = folder.role?.toUpperCase();
  if (role) return SKIPPED_FOLDER_ROLES.has(role);

  const name = folder.name?.toLowerCase() ?? "";
  return SKIPPED_FOLDER_NAME_KEYWORDS.some((keyword) => name.includes(keyword));
}

function normalizeFolderName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const SENT_FOLDER_NAMES = new Set(
  [
    "Sent",
    "Sent Items",
    "Sent Mail",
    "Sent Messages",
    "Gesendete Elemente",
    "Gesendete Objekte",
    "Gesendet",
    "Éléments envoyés",
    "Messages envoyés",
    "Elementos enviados",
    "Posta inviata",
    "Elementi inviati",
    "Itens enviados",
    "Verzonden items",
    "Elementy wysłane",
    "Skickat",
    "Sendte elementer",
    "Lähetetyt",
    "Gönderilmiş Öğeler",
    "Odeslaná pošta",
    "Отправленные",
    "送信済みアイテム",
    "已发送邮件",
    "보낸 편지함",
  ].map(normalizeFolderName),
);

export function isSentEmailFolder(folder: { role?: string | null; name?: string | null }): boolean {
  if (folder.role?.toUpperCase() === "SENT") return true;

  return SENT_FOLDER_NAMES.has(normalizeFolderName(folder.name ?? ""));
}

export function isDraftEmailFolder(folder: { role?: string | null; name?: string | null }): boolean {
  if (folder.role?.toUpperCase() === "DRAFTS") return true;

  return normalizeFolderName(folder.name ?? "").includes("draft");
}

export function buildFolderCatalog(folders: FolderLike[]): EmailFolder[] {
  return folders
    .filter((folder): folder is FolderLike & { id: string } => typeof folder.id === "string")
    .map((folder) => ({
      id: folder.id,
      name: folder.name ?? null,
      role: folder.role ?? null,
      totalCount: folder.total_count ?? null,
      unreadCount: folder.unread_count ?? null,
    }));
}

export function defaultSelectedFolderIds(folders: FolderLike[]): string[] {
  return folders
    .filter((folder): folder is FolderLike & { id: string } => typeof folder.id === "string")
    .filter((folder) => !isSkippedEmailFolder(folder))
    .map((folder) => folder.id)
    .sort();
}

export function isMovableEmailFolder(folder: { role?: string | null; name?: string | null }): boolean {
  return !isSentEmailFolder(folder) && !isDraftEmailFolder(folder);
}

export function threadEmailFolderIds(
  messages: { folderIds: string[]; sentAt: Date }[],
  catalog: EmailFolder[],
): string[] {
  const byId = new Map(catalog.map((folder) => [folder.id, folder]));
  const movable = (id: string) => isMovableEmailFolder(byId.get(id) ?? {});
  const newestFirst = [...messages].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

  const filed = newestFirst.find((message) => message.folderIds.some(movable));
  if (filed) return [...new Set(filed.folderIds.filter(movable))].sort();

  const outbound = newestFirst.find((message) => message.folderIds.length > 0);
  return outbound ? [...new Set(outbound.folderIds)].sort() : [];
}
