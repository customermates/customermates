import { describe, expect, it } from "vitest";
import { htmlToPlainText } from "@/ee/messaging/email-body-text";

const budget = (label: string, html: string, ms: number) => {
  const start = performance.now();
  htmlToPlainText(html);
  const took = performance.now() - start;
  expect(took, `${label} took ${took.toFixed(0)}ms, budget ${ms}ms`).toBeLessThan(ms);
};

describe("htmlToPlainText is not quadratic on malformed markup", () => {
  it("survives unterminated anchors", () => budget("anchors 250KB", '<a href="h">x'.repeat(20000), 2000));
  it("survives unclosed style blocks", () => budget("style 1.7MB", "<style x>".repeat(200000), 2000));
  it("survives unclosed script blocks", () => budget("script 1.7MB", "<script x>".repeat(200000), 2000));
  it("stays fast on large well-formed mail", () =>
    budget("well-formed 900KB", '<a href="https://e.com/p">Label</a> text. '.repeat(20000), 2000));
});

describe("behaviour preserved", () => {
  it("still strips style and script content", () => {
    expect(htmlToPlainText("<style>body{color:red}</style>Hello")).toBe("Hello");
    expect(htmlToPlainText("<script>var a=1<2;</script>Hello")).toBe("Hello");
    expect(htmlToPlainText("<STYLE>x{}</STYLE>Hi")).toBe("Hi");
  });
  it("still strips a large legitimate style block", () => {
    const css = "a{color:red}".repeat(20000);
    expect(htmlToPlainText(`<style>${css}</style>Body text`)).toBe("Body text");
  });
  it("still annotates links", () => {
    expect(htmlToPlainText('<a href="https://e.com">Docs</a>')).toBe("Docs (https://e.com)");
    expect(htmlToPlainText(String.raw`<a href="x">a<b>bold</b>c</a>`)).toBe("aboldc (x)");
  });
});
