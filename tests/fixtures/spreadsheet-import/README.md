# Spreadsheet import fixtures

Each file holds the same two German contacts, unless noted. The files test that the list import and the workspace setup read what people really upload.

| File | Written by |
| --- | --- |
| `comma-utf8.csv`, `comma-utf8-bom.csv`, `comma-utf8-lf.csv`, `semicolon-utf8.csv`, `semicolon-utf8-bom.csv` | A script, as Excel's "CSV UTF-8" and other tools write them |
| `semicolon-macroman.csv` | A script, in Mac Roman, the encoding of a plain CSV from Excel for Mac |
| `semicolon-cp1252.csv` | A script, in Windows-1252, the encoding of a plain CSV from Excel for Windows |
| `libreoffice.xlsx` | LibreOffice Calc |
| `legacy-biff8.xls` | LibreOffice Calc, as "Excel 97-2003" |
| `excel95-biff5.xls` | SheetJS, as Excel 5.0/95 (BIFF5), with the umlauts put back as the Windows-1252 bytes Excel 95 writes (SheetJS writes them as `_`); LibreOffice no longer writes this format |
| `excel95-genuine.xls` | Microsoft Excel 95, a table of numbers and their squares, not the contacts. From the [Apache POI test data](https://github.com/apache/poi/blob/trunk/test-data/spreadsheet/testEXCEL_95.xls), Apache License 2.0. |
| `xml-2003.xls` | LibreOffice Calc, as "Microsoft Excel 2003 XML", with the `.xls` name Excel gives such files |
| `html-table.xls` | LibreOffice Calc, as HTML, with the `.xls` name many web applications give their Excel exports |
| `excel-mac-16.xlsx` | Microsoft Excel 16 for Mac (`docProps/app.xml`: Microsoft Macintosh Excel 16.0300). A Title, Country and Position table, not the contacts. From the [Apache POI test data](https://github.com/apache/poi/blob/trunk/test-data/spreadsheet/64759.xlsx), Apache License 2.0. |
