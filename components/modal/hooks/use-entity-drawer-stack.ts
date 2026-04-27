"use client";

import type { EntityType } from "@/generated/prisma";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { useRouter as useGuardedIntlRouter } from "@/i18n/navigation";

const OPEN_PARAM = "open";

export type EntityDrawerEntry = {
  entityType: EntityType;
  id: string;
};

const VALID_ENTITY_TYPES: readonly EntityType[] = ["contact", "organization", "deal", "service", "task"] as const;

export const ENTITY_URL_SEGMENT: Record<EntityType, string> = {
  contact: "contacts",
  organization: "organizations",
  deal: "deals",
  service: "services",
  task: "tasks",
};

function parseOpenParam(raw: string | null): EntityDrawerEntry[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const [entityType, id] = token.split(":");
      if (!entityType || !id) return null;
      if (!VALID_ENTITY_TYPES.includes(entityType as EntityType)) return null;
      return { entityType: entityType as EntityType, id };
    })
    .filter((x): x is EntityDrawerEntry => x !== null);
}

function serializeStack(stack: EntityDrawerEntry[]): string | null {
  if (stack.length === 0) return null;
  return stack.map((e) => `${e.entityType}:${e.id}`).join(",");
}

export function useEntityDrawerStack() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const stack = useMemo(() => parseOpenParam(searchParams.get(OPEN_PARAM)), [searchParams]);
  const top = stack.length > 0 ? stack[stack.length - 1] : undefined;

  const writeStack = useCallback(
    (next: EntityDrawerEntry[], method: "push" | "replace" = "push") => {
      const params = new URLSearchParams(searchParams.toString());
      const serialized = serializeStack(next);
      if (serialized) params.set(OPEN_PARAM, serialized);
      else params.delete(OPEN_PARAM);

      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (method === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const pushEntity = useCallback(
    (entry: EntityDrawerEntry) => {
      const currentTop = stack[stack.length - 1];
      if (currentTop && currentTop.entityType === entry.entityType && currentTop.id === entry.id) return;
      writeStack([...stack, entry]);
    },
    [stack, writeStack],
  );

  const popTop = useCallback(() => {
    if (stack.length === 0) return;
    writeStack(stack.slice(0, -1), "push");
  }, [stack, writeStack]);

  const popAll = useCallback(() => {
    if (stack.length === 0) return;
    writeStack([], "replace");
  }, [stack, writeStack]);

  return { stack, top, pushEntity, popTop, popAll };
}

export function useOpenEntity() {
  const { pushEntity } = useEntityDrawerStack();
  const router = useGuardedIntlRouter();
  return useCallback(
    (entityType: EntityType, id: string) => {
      if (id === "new") {
        pushEntity({ entityType, id });
        return;
      }
      const segment = ENTITY_URL_SEGMENT[entityType];
      router.push(`/${segment}/${id}`);
    },
    [pushEntity, router],
  );
}
