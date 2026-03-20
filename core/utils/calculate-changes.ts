import deepEqual from "fast-deep-equal/es6";

type ChangeRecord = Record<string, { previous: unknown; current: unknown }>;

function findKeyProperty(arr: unknown[]): string | null {
  if (arr.length === 0) return null;

  const firstItem = arr[0];
  if (typeof firstItem !== "object" || firstItem === null || Array.isArray(firstItem)) return null;

  const commonKeys = ["id", "columnId", "key"];
  for (const key of commonKeys) {
    if (key in firstItem) {
      const hasKey = arr.every((item) => typeof item === "object" && item !== null && key in item);
      if (hasKey) return key;
    }
  }

  return null;
}

function compareArraysByKey(
  previous: unknown[],
  current: unknown[],
  keyProperty: string,
): { previous: unknown[]; current: unknown[] } | null {
  const previousMap = new Map<unknown, unknown>();
  const currentMap = new Map<unknown, unknown>();

  for (const item of previous) {
    if (typeof item === "object" && item !== null && keyProperty in item) {
      const key = (item as Record<string, unknown>)[keyProperty];
      previousMap.set(key, item);
    }
  }

  for (const item of current) {
    if (typeof item === "object" && item !== null && keyProperty in item) {
      const key = (item as Record<string, unknown>)[keyProperty];
      currentMap.set(key, item);
    }
  }

  const changedItems: { previous: unknown[]; current: unknown[] } = { previous: [], current: [] };
  const allKeys = new Set([...previousMap.keys(), ...currentMap.keys()]);
  let hasChanges = false;

  for (const key of allKeys) {
    const prevItem = previousMap.get(key);
    const currItem = currentMap.get(key);

    if (!deepEqual(prevItem, currItem)) {
      hasChanges = true;
      if (prevItem !== undefined) changedItems.previous.push(prevItem);
      if (currItem !== undefined) changedItems.current.push(currItem);
    }
  }

  return hasChanges ? changedItems : null;
}

export function calculateChanges<T extends Record<string, unknown>>(previous: T | undefined, current: T): ChangeRecord {
  if (!previous) return {};

  const changes: ChangeRecord = {};

  const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);

  for (const key of allKeys) {
    const previousValue = previous[key];
    const currentValue = current[key];

    if (Array.isArray(previousValue) && Array.isArray(currentValue)) {
      const keyProperty = findKeyProperty(previousValue) || findKeyProperty(currentValue);
      if (keyProperty) {
        const arrayChanges = compareArraysByKey(previousValue, currentValue, keyProperty);
        if (arrayChanges) changes[key] = arrayChanges;
      } else if (!deepEqual(previousValue, currentValue))
        changes[key] = { previous: previousValue, current: currentValue };
    } else if (!deepEqual(previousValue, currentValue))
      changes[key] = { previous: previousValue, current: currentValue };
  }

  return changes;
}
