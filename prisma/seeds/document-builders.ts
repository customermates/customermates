/** Builders for the small documents the demo seed stores on records and the file tests read. */
import { deflateRawSync } from "node:zlib";

import { crc32 } from "@/core/utils/zip";

export function pdfFixture(pages: string[][]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pagesId = objects.length + 1 + pages.length * 2;
  const kids: number[] = [];
  for (const lines of pages) {
    const text = lines.flatMap((line, index) => [
      ...(index > 0 ? ["0 -16 Td"] : []),
      `(${line.replace(/[()\\]/g, "\\$&")}) Tj`,
    ]);
    const stream = ["BT", "/F1 12 Tf", "72 720 Td", ...text, "ET"].join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  add(`<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${kids.length} >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(body, (character) => character.charCodeAt(0));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

function header(size: number, fields: Array<[number, number, 2 | 4]>): Uint8Array {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  for (const [offset, value, width] of fields) {
    if (width === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
  }
  return bytes;
}

export type ZipArchiveEntry = { name: string; data: Uint8Array; stored?: boolean; checksum?: number };

export function zipArchive(entries: readonly ZipArchiveEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const { name, data, stored, checksum = crc32(data) } of entries) {
    const compressed = stored ? data : new Uint8Array(deflateRawSync(data));
    const method = stored ? 0 : 8;
    const fileName = new TextEncoder().encode(name);
    const local = header(30, [
      [0, 0x04034b50, 4],
      [4, 20, 2],
      [8, method, 2],
      [14, checksum, 4],
      [18, compressed.byteLength, 4],
      [22, data.byteLength, 4],
      [26, fileName.byteLength, 2],
    ]);
    const central = header(46, [
      [0, 0x02014b50, 4],
      [4, 20, 2],
      [6, 20, 2],
      [10, method, 2],
      [16, checksum, 4],
      [20, compressed.byteLength, 4],
      [24, data.byteLength, 4],
      [28, fileName.byteLength, 2],
      [42, offset, 4],
    ]);
    locals.push(local, fileName, compressed);
    centrals.push(central, fileName);
    offset += local.byteLength + fileName.byteLength + compressed.byteLength;
  }
  const directory = concat(centrals);
  const end = header(22, [
    [0, 0x06054b50, 4],
    [8, entries.length, 2],
    [10, entries.length, 2],
    [12, directory.byteLength, 4],
    [16, offset, 4],
  ]);
  return concat([...locals, directory, end]);
}

export function zipFixture(entries: Record<string, string | Uint8Array>): Uint8Array {
  return zipArchive(
    Object.entries(entries).map(([name, text]) => ({
      name,
      data: typeof text === "string" ? new TextEncoder().encode(text) : text,
    })),
  );
}

function xmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type DocxBlock = { heading?: 1 | 2 | 3; text: string } | { table: string[][] };

export function docxFixture(blocks: DocxBlock[]): Uint8Array {
  const paragraph = (text: string, style?: string) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${xmlText(text)}</w:t></w:r></w:p>`;
  const body = blocks
    .map((block) =>
      "table" in block
        ? `<w:tbl>${block.table
            .map((row) => `<w:tr>${row.map((cell) => `<w:tc>${paragraph(cell)}</w:tc>`).join("")}</w:tr>`)
            .join("")}</w:tbl>`
        : paragraph(block.text, block.heading ? `Heading${block.heading}` : undefined),
    )
    .join("");
  const styles = [1, 2, 3]
    .map(
      (level) => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/></w:style>`,
    )
    .join("");
  return zipFixture({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "word/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${styles}</w:styles>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  });
}

const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "„": 0x84,
  "…": 0x85,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "™": 0x99,
};

function winAnsi(text: string): string {
  return [...text]
    .map((character) => {
      const code = character.charCodeAt(0);
      if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) return character;
      const mapped = WIN_ANSI_EXTRA[character];
      return mapped === undefined ? "?" : String.fromCharCode(mapped);
    })
    .join("");
}

function pdfString(text: string): string {
  return `(${winAnsi(text).replace(/[()\\]/g, "\\$&")})`;
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return line ? [...lines, line] : [""];
}

/**
 * A text PDF on A4 pages: `# ` starts the title, `## ` a heading, `| a | b |` a table row (cells in fixed columns,
 * the first row bold), anything else a wrapped paragraph line; an empty line adds space. Helvetica with WinAnsi
 * encoding, so the text can be selected and extracted. The same lines always give the same bytes.
 */
export function pdfDocument(lines: readonly string[], footer?: string): Uint8Array {
  const pages: string[][] = [[]];
  let y = 790;
  let tableRow = 0;
  const page = () => pages[pages.length - 1];
  const need = (height: number) => {
    if (y - height < 70) {
      pages.push([]);
      y = 790;
    }
  };
  const text = (font: "F1" | "F2", size: number, x: number, value: string, gray = 0) =>
    page().push(`BT /${font} ${size} Tf ${gray} g ${x} ${y} Td ${pdfString(value)} Tj ET`);
  for (const raw of lines) {
    if (raw.startsWith("| ")) {
      const cells = raw
        .slice(1, raw.endsWith("|") ? -1 : undefined)
        .split("|")
        .map((cell) => cell.trim());
      need(18);
      const width = 451 / cells.length;
      cells.forEach((cell, index) => text(tableRow === 0 ? "F2" : "F1", 10, 72 + index * width, cell));
      if (tableRow === 0) page().push(`0.6 G 0.5 w 72 ${y - 5} m 523 ${y - 5} l S`);
      tableRow += 1;
      y -= 18;
      continue;
    }
    tableRow = 0;
    if (raw.startsWith("# ")) {
      need(40);
      text("F2", 18, 72, raw.slice(2));
      y -= 30;
    } else if (raw.startsWith("## ")) {
      need(30);
      y -= 6;
      text("F2", 12.5, 72, raw.slice(3));
      y -= 20;
    } else if (!raw.trim()) y -= 8;
    else {
      for (const line of wrap(raw, 92)) {
        need(15);
        text("F1", 10.5, 72, line);
        y -= 15;
      }
    }
  }
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const regular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pagesId = objects.length + 1 + pages.length * 2;
  const kids: number[] = [];
  pages.forEach((commands, index) => {
    const footerText = [footer, `${index + 1} / ${pages.length}`].filter(Boolean).join("   ·   ");
    const stream = [...commands, `BT /F1 8 Tf 0.45 g 72 40 Td ${pdfString(footerText)} Tj ET`].join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  });
  add(`<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${kids.length} >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(body, (character) => character.charCodeAt(0));
}

/** A Word document from the same line syntax as `pdfDocument`; consecutive table rows form one table. */
export function docxDocument(lines: readonly string[]): Uint8Array {
  const blocks: DocxBlock[] = [];
  for (const line of lines) {
    if (line.startsWith("| ")) {
      const cells = line
        .slice(1, line.endsWith("|") ? -1 : undefined)
        .split("|")
        .map((cell) => cell.trim());
      const last = blocks.at(-1);
      if (last && "table" in last) last.table.push(cells);
      else blocks.push({ table: [cells] });
    } else if (line.startsWith("# ")) blocks.push({ heading: 1, text: line.slice(2) });
    else if (line.startsWith("## ")) blocks.push({ heading: 2, text: line.slice(3) });
    else blocks.push({ text: line });
  }
  return docxFixture(blocks);
}

function columnName(index: number): string {
  let name = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26))
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  return name;
}

/** A one-sheet workbook with shared strings and numbers; the first row is the header. No timestamps, so stable. */
export function xlsxDocument(sheetName: string, rows: ReadonlyArray<ReadonlyArray<string | number>>): Uint8Array {
  const strings: string[] = [];
  const stringIndex = (value: string) => {
    const found = strings.indexOf(value);
    if (found >= 0) return found;
    strings.push(value);
    return strings.length - 1;
  };
  const widths = rows.reduce<number[]>(
    (all, row) => row.map((cell, index) => Math.max(all[index] ?? 8, String(cell).length + 2)),
    [],
  );
  const sheetRows = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((cell, index) => {
            const ref = `${columnName(index)}${rowIndex + 1}`;
            const style = rowIndex === 0 ? 's="1"' : "";
            return typeof cell === "number"
              ? `<c r="${ref}" ${style}><v>${cell}</v></c>`
              : `<c r="${ref}" ${style} t="s"><v>${stringIndex(cell)}</v></c>`;
          })
          .join("")}</row>`,
    )
    .join("");
  const cols = widths
    .map(
      (width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.min(width, 60)}" customWidth="1"/>`,
    )
    .join("");
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return zipFixture({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="${xmlText(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><cols>${cols}</cols><sheetData>${sheetRows}</sheetData></worksheet>`,
    "xl/sharedStrings.xml": `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="${ns}" count="${strings.length}" uniqueCount="${strings.length}">${strings
      .map((value) => `<si><t xml:space="preserve">${xmlText(value)}</t></si>`)
      .join("")}</sst>`,
  });
}

/** A comma-separated file with quoted cells where needed. */
export function csvDocument(rows: ReadonlyArray<ReadonlyArray<string | number>>): Uint8Array {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return new TextEncoder().encode(`${rows.map((row) => row.map(cell).join(",")).join("\n")}\n`);
}
