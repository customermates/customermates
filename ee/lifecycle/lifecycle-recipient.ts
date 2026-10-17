import type { User } from "@/generated/prisma";

export type LifecycleRecipient = User & { company: { name: string | null } };
