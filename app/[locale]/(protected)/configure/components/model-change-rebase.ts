import equal from "fast-deep-equal/es6";
import { cloneDeep } from "lodash";

export function rebaseModelChangeDraft<Form extends object>(saved: Form, draft: Form, latest: Form) {
  const form = cloneDeep(latest);
  const conflicts: string[] = [];
  for (const key of Object.keys(latest) as Array<keyof Form & string>) {
    if (equal(draft[key], saved[key])) continue;
    if (!equal(latest[key], saved[key]) && !equal(latest[key], draft[key])) conflicts.push(key);
    form[key] = cloneDeep(draft[key]);
  }
  return { form, savedState: cloneDeep(latest), conflicts };
}
