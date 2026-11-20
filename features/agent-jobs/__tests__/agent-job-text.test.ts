import { describe, expect, it } from "vitest";

import { clipText, storableText } from "../agent-job-text";

const EMOJI = "\u{1F600}";
const HIGH = EMOJI[0];
const LOW = EMOJI[1];

describe("agent job text", () => {
  it("cuts before a character that would be split in two", () => {
    expect(clipText(`ab${EMOJI}`, 3)).toBe("ab");
    expect(clipText(`ab${EMOJI}`, 4)).toBe(`ab${EMOJI}`);
    expect(clipText(`a${EMOJI}b`, 3)).toBe(`a${EMOJI}`);
    expect(clipText("abc", 2)).toBe("ab");
    expect(clipText("abc", 5)).toBe("abc");
  });

  it("removes NUL and replaces a surrogate that stands alone, and keeps whole pairs", () => {
    expect(storableText(`a\u0000b`)).toBe("ab");
    expect(storableText(`a${HIGH}b`)).toBe("a�b");
    expect(storableText(`a${LOW}b`)).toBe("a�b");
    expect(storableText(`${LOW}${HIGH}`)).toBe("��");
    expect(storableText(`a${EMOJI}b`)).toBe(`a${EMOJI}b`);
  });

  it("never returns text that JSON would write with a lone surrogate escape", () => {
    for (let max = 0; max <= 8; max += 1) {
      const cut = clipText(`${EMOJI}${EMOJI}\u0000${HIGH}${EMOJI}`, max);
      expect(cut.length).toBeLessThanOrEqual(max);
      expect(JSON.stringify(cut)).not.toMatch(/\\ud[89a-f]/i);
    }
  });
});
