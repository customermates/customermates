export const LEMON_SQUEEZY_AFFILIATE_SCRIPT_SRC = "https://lmsqueezy.com/affiliate.js";
export const LEMON_SQUEEZY_AFFILIATE_STORE = "customermates";
export const LEMON_SQUEEZY_REFERRAL_PARAM = "aff";

const INTERACTION_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
const IDLE_TIMEOUT_MS = 4_000;

export function hasLemonSqueezyReferral(search: string): boolean {
  return new URLSearchParams(search).has(LEMON_SQUEEZY_REFERRAL_PARAM);
}

export function scheduleLemonSqueezyAffiliate(win: Window, doc: Document): () => void {
  let settled = false;
  let idleHandle: number | undefined;

  function detach() {
    for (const type of INTERACTION_EVENTS) win.removeEventListener(type, load);
    win.removeEventListener("load", waitForIdle);
    if (idleHandle !== undefined) win.cancelIdleCallback?.(idleHandle);
  }

  function load() {
    if (settled) return;
    settled = true;
    detach();
    if (doc.querySelector(`script[src="${LEMON_SQUEEZY_AFFILIATE_SCRIPT_SRC}"]`)) return;

    Object.assign(win, { lemonSqueezyAffiliateConfig: { store: LEMON_SQUEEZY_AFFILIATE_STORE } });
    const script = doc.createElement("script");
    script.src = LEMON_SQUEEZY_AFFILIATE_SCRIPT_SRC;
    script.async = true;
    doc.body.appendChild(script);
  }

  function waitForIdle() {
    if (win.requestIdleCallback) idleHandle = win.requestIdleCallback(load, { timeout: IDLE_TIMEOUT_MS });
    else win.setTimeout(load, 0);
  }

  if (hasLemonSqueezyReferral(win.location.search)) {
    load();

    return detach;
  }

  for (const type of INTERACTION_EVENTS) win.addEventListener(type, load, { once: true, passive: true });

  if (doc.readyState === "complete") waitForIdle();
  else win.addEventListener("load", waitForIdle, { once: true });

  return () => {
    settled = true;
    detach();
  };
}
