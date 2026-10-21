export function stripMarkdownHeadingIds(markdown: string): string {
  let fence: { marker: string; length: number } | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
      if (delimiter) {
        if (!fence) fence = { marker: delimiter[1][0], length: delimiter[1].length };
        else if (delimiter[1][0] === fence.marker && delimiter[1].length >= fence.length && delimiter[2].trim() === "")
          fence = null;
        return line;
      }
      return fence
        ? line
        : line.replace(/^( {0,3}#{1,6}[ \t]+.+?)[ \t]+(?:\\?\{#[^}\n]+\\?\}|\\?\[#[^\]\n]+\\?\])[ \t]*$/u, "$1");
    })
    .join("\n");
}
