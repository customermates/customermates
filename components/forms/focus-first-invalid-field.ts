const INVALID_FIELD = '[aria-invalid="true"], [data-invalid="true"]';
const FOCUSABLE = "input, select, textarea, button, [tabindex]";

export function focusFirstInvalidField(container: Element | null) {
  if (!container) return;
  requestAnimationFrame(() => {
    const invalid = container.querySelector<HTMLElement>(INVALID_FIELD);
    if (!invalid) return;
    const target = invalid.matches(FOCUSABLE) ? invalid : invalid.querySelector<HTMLElement>(FOCUSABLE);
    (target ?? invalid).focus();
    (target ?? invalid).scrollIntoView({ block: "nearest" });
  });
}
