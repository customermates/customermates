import type { Workbook } from "exceljs";

import { deflateRawSync } from "node:zlib";

type ExcelModule = { Workbook: typeof Workbook; default?: { Workbook: typeof Workbook } };

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

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
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
  for (const [offset, value, width] of fields)
    if (width === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
  return bytes;
}

export function zipFixture(entries: Record<string, string | Uint8Array>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = typeof text === "string" ? new TextEncoder().encode(text) : text;
    const compressed = new Uint8Array(deflateRawSync(data));
    const fileName = new TextEncoder().encode(name);
    const checksum = crc32(data);
    const local = header(30, [
      [0, 0x04034b50, 4],
      [4, 20, 2],
      [8, 8, 2],
      [14, checksum, 4],
      [18, compressed.byteLength, 4],
      [22, data.byteLength, 4],
      [26, fileName.byteLength, 2],
    ]);
    const central = header(46, [
      [0, 0x02014b50, 4],
      [4, 20, 2],
      [6, 20, 2],
      [10, 8, 2],
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
  const count = Object.keys(entries).length;
  const end = header(22, [
    [0, 0x06054b50, 4],
    [8, count, 2],
    [10, count, 2],
    [12, directory.byteLength, 4],
    [16, offset, 4],
  ]);
  return concat([...locals, directory, end]);
}

function xmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

export async function xlsxFixture(sheets: Record<string, unknown[][]>): Promise<Uint8Array> {
  const exceljs = (await import("exceljs")) as unknown as ExcelModule;
  const workbook = new (exceljs.default?.Workbook ?? exceljs.Workbook)();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(name);
    for (const row of rows) sheet.addRow(row);
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
