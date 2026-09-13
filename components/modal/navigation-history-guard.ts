import type { NavigationGuardController } from "@/core/stores/navigation-guard.controller";

const HISTORY_KEY = "__customermatesHistory";
type Position = { session: string; index: number };
type HistoryGuard = {
  connect: (guard: NavigationGuardController) => () => void;
};
const adapters = new WeakMap<Window, HistoryGuard>();

function positionFrom(state: unknown): Position | null {
  if (!state || typeof state !== "object" || !(HISTORY_KEY in state)) return null;
  const value = state[HISTORY_KEY];
  if (
    !value ||
    typeof value !== "object" ||
    !("session" in value) ||
    typeof value.session !== "string" ||
    !("index" in value) ||
    typeof value.index !== "number" ||
    !Number.isSafeInteger(value.index)
  )
    return null;
  return { session: value.session, index: value.index };
}

function createHistoryGuard(browser: Window): HistoryGuard {
  const history = browser.history;
  const pushState = history.pushState.bind(history);
  const replaceState = history.replaceState.bind(history);
  const guards = new Map<NavigationGuardController, number>();
  let position = positionFrom(history.state) ?? {
    session: crypto.randomUUID(),
    index: 0,
  };
  let restoring: Position | null = null;
  let approved: Position | null = null;

  const withPosition = (state: unknown, value: Position) => ({
    ...(state && typeof state === "object" ? state : {}),
    [HISTORY_KEY]: value,
  });
  replaceState(withPosition(history.state, position), "");

  history.pushState = (state, unused, url) => {
    const next = { ...position, index: position.index + 1 };
    pushState(withPosition(state, next), unused, url);
    position = next;
  };
  history.replaceState = (state, unused, url) => {
    replaceState(withPosition(state, position), unused, url);
  };

  browser.addEventListener(
    "popstate",
    (event) => {
      const next = positionFrom(event.state);
      if (!next || next.session !== position.session) {
        position = next ?? { session: crypto.randomUUID(), index: 0 };
        replaceState(withPosition(history.state, position), "");
        restoring = null;
        approved = null;
        return;
      }
      const guard = [...guards.keys()].find((candidate) => candidate.isGuarding);
      if (next.index === position.index && restoring) {
        event.stopImmediatePropagation();
        const target = restoring;
        restoring = null;
        const navigate = () => {
          approved = target;
          history.go(target.index - position.index);
        };
        if (guard) guard.tryNavigate(navigate);
        else navigate();
        return;
      }
      if (!guard || approved?.index === next.index) {
        approved = null;
        position = next;
        return;
      }
      if (next.index === position.index) return;

      event.stopImmediatePropagation();
      restoring = next;
      history.go(position.index - next.index);
    },
    true,
  );

  return {
    connect: (guard) => {
      guards.set(guard, (guards.get(guard) ?? 0) + 1);
      return () => {
        const count = guards.get(guard) ?? 0;
        if (count > 1) guards.set(guard, count - 1);
        else guards.delete(guard);
      };
    },
  };
}

export function initializeNavigationHistoryGuard(browser: Window = window) {
  let adapter = adapters.get(browser);
  if (!adapter) {
    adapter = createHistoryGuard(browser);
    adapters.set(browser, adapter);
  }
  return adapter;
}

export function connectNavigationHistoryGuard(guard: NavigationGuardController, browser: Window = window) {
  return initializeNavigationHistoryGuard(browser).connect(guard);
}
