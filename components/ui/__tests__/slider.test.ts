import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Slider } from "../slider";

describe("Slider", () => {
  it("forwards its accessible name to the focusable thumb", () => {
    const markup = renderToStaticMarkup(
      createElement(Slider, { "aria-label": "Number of users", min: 1, max: 25, value: [1] }),
    );

    expect(markup).toMatch(/role="slider"[^>]*aria-label="Number of users"/);
  });
});
