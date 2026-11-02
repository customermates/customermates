Exact XLSX regression fixtures from the 2026-11-02 Mac import test.

Pairs (failing original -> passing namespace-normalized copy):
C01 -> C24
C10 -> C25
C11 -> C26
C12 -> C27

The originals failed at step 1 in Safari 27.0.1 and Chrome 156.0.8078.79
with: That workbook could not be read.
The paired copies imported successfully and saved the expected names.
ZIP/XML integrity checks passed and read-only openpyxl confirmed identical
sheet names and every cell value in each pair. Parser code was not inspected;
namespace-prefix compatibility is an inference from these paired results.
These are generated fixtures, not fresh Excel or Numbers exports.

Extract this archive, then verify its files using: sha256sum -c SHA256SUMS
On macOS use: shasum -a 256 -c SHA256SUMS
Preserve file bytes exactly; do not open and resave with a spreadsheet editor.
