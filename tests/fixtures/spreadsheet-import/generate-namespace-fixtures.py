"""Generate equivalent XLSX pairs with default and prefixed XML namespaces."""

from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types"
ROOT = Path(__file__).parent
HEADERS = ["Vorname", "Nachname", "E-Mail", "Firma"]
CONTACTS = [
    ["Jürgen", "Müller", "juergen@example.test", "Bäckerei Größl"],
    ["Ölaf", "Strauß", "oelaf@example.test", "Äpfel & Söhne"],
]
CASES = {
    "contacts": [("Kontakte", [HEADERS, *CONTACTS])],
    "blank-rows": [("Kontakte", [HEADERS, [], CONTACTS[0], [], CONTACTS[1]])],
    "multiple-sheets": [
        ("Kontakte", [HEADERS, *CONTACTS]),
        ("Types", [["Name", "Amount", "Since", "Active", "Double"], ["x:literal & <tag>", 12.5, "DATE", True, "FORMULA"]]),
    ],
    "unicode": [("Kontakte", [HEADERS, ["李 🧑🏽‍💻", "山田 e\u0301", "unicode@example.test", "Ω & <xml> x:tag"]])],
}


def element(namespace, name, attributes=None, text=None):
    node = ET.Element(f"{{{namespace}}}{name}", attributes or {})
    node.text = text
    return node


def write_case(case, sheets, prefixed):
    ET.register_namespace("link" if prefixed else "r", REL)
    entries = {}

    def save(path, node):
        namespace = node.tag[1:].split("}", 1)[0]
        prefix = {MAIN: "x", PACKAGE_REL: "pkg", CONTENT_TYPES: "ct"}[namespace]
        ET.register_namespace(prefix if prefixed else "", namespace)
        entries[path] = ET.tostring(node, encoding="utf-8", xml_declaration=True)

    types = element(CONTENT_TYPES, "Types")
    for extension, content_type in [("rels", "application/vnd.openxmlformats-package.relationships+xml"), ("xml", "application/xml")]:
        types.append(element(CONTENT_TYPES, "Default", {"Extension": extension, "ContentType": content_type}))
    for part, kind in [("workbook", "sheet.main"), ("styles", "styles"), ("sharedStrings", "sharedStrings")]:
        types.append(element(CONTENT_TYPES, "Override", {"PartName": f"/xl/{part}.xml", "ContentType": f"application/vnd.openxmlformats-officedocument.spreadsheetml.{kind}+xml"}))
    for index in range(1, len(sheets) + 1):
        types.append(element(CONTENT_TYPES, "Override", {"PartName": f"/xl/worksheets/sheet{index}.xml", "ContentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"}))
    save("[Content_Types].xml", types)

    def relationships(items):
        node = element(PACKAGE_REL, "Relationships")
        for identifier, kind, target in items:
            node.append(element(PACKAGE_REL, "Relationship", {"Id": identifier, "Type": f"{REL}/{kind}", "Target": target}))
        return node

    save("_rels/.rels", relationships([("rId1", "officeDocument", "xl/workbook.xml")]))
    workbook = element(MAIN, "workbook")
    sheet_nodes = element(MAIN, "sheets")
    workbook.append(sheet_nodes)
    strings = []
    for index, (name, rows) in enumerate(sheets, 1):
        sheet_nodes.append(element(MAIN, "sheet", {"name": name, "sheetId": str(index), f"{{{REL}}}id": f"rId{index}"}))
        worksheet = element(MAIN, "worksheet")
        data = element(MAIN, "sheetData")
        worksheet.append(data)
        for row_index, values in enumerate(rows, 1):
            row = element(MAIN, "row", {"r": str(row_index)})
            data.append(row)
            for column, value in enumerate(values):
                cell = element(MAIN, "c", {"r": f"{chr(65 + column)}{row_index}"})
                row.append(cell)
                if value == "DATE":
                    cell.set("s", "1")
                    cell.append(element(MAIN, "v", text="46024"))
                elif value == "FORMULA":
                    cell.append(element(MAIN, "f", text=f"B{row_index}*2"))
                    cell.append(element(MAIN, "v", text="25"))
                elif isinstance(value, bool):
                    cell.set("t", "b")
                    cell.append(element(MAIN, "v", text="1" if value else "0"))
                elif isinstance(value, (float, int)):
                    cell.append(element(MAIN, "v", text=str(value)))
                else:
                    cell.set("t", "s")
                    cell.append(element(MAIN, "v", text=str(len(strings))))
                    strings.append(value)
        save(f"xl/worksheets/sheet{index}.xml", worksheet)
    save("xl/workbook.xml", workbook)
    save("xl/_rels/workbook.xml.rels", relationships([
        *[(f"rId{index}", "worksheet", f"worksheets/sheet{index}.xml") for index in range(1, len(sheets) + 1)],
        ("strings", "sharedStrings", "sharedStrings.xml"),
        ("styles", "styles", "styles.xml"),
    ]))
    shared = element(MAIN, "sst", {"count": str(len(strings)), "uniqueCount": str(len(strings))})
    for text in strings:
        item = element(MAIN, "si")
        item.append(element(MAIN, "t", text=text))
        shared.append(item)
    save("xl/sharedStrings.xml", shared)
    styles = ET.fromstring(f'<styleSheet xmlns="{MAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>')
    save("xl/styles.xml", styles)
    suffix = "prefixed" if prefixed else "default"
    with ZipFile(ROOT / f"namespace-{case}-{suffix}.xlsx", "w") as archive:
        for path, content in entries.items():
            info = ZipInfo(path, date_time=(2026, 11, 2, 0, 0, 0))
            archive.writestr(info, content, compress_type=ZIP_DEFLATED)


for case, sheets in CASES.items():
    for prefixed in (False, True):
        write_case(case, sheets, prefixed)
