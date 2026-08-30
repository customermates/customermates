export type ClipboardPayload = string | Promise<string>;

function canWriteClipboardItems(): boolean {
  return typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";
}

function writeItem(text: ClipboardPayload): Promise<void> {
  const blob = Promise.resolve(text).then((resolved) => new Blob([resolved], { type: "text/plain" }));

  return navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
}

function writeWithSelection(text: string): boolean {
  const selection = document.getSelection();
  const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const textarea = document.createElement("textarea");

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);

    if (selection && previous) {
      selection.removeAllRanges();
      selection.addRange(previous);
    }
  }
}

export async function copyToClipboard(text: ClipboardPayload): Promise<boolean> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  if (typeof text !== "string") {
    if (canWriteClipboardItems()) {
      try {
        await writeItem(text);

        return true;
      } catch {}
    }

    try {
      return await copyToClipboard(await text);
    } catch {
      return false;
    }
  }

  if (typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);

      return true;
    } catch {}
  }

  if (canWriteClipboardItems()) {
    try {
      await writeItem(text);

      return true;
    } catch {}
  }

  try {
    return writeWithSelection(text);
  } catch {
    return false;
  }
}
