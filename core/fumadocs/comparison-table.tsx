import { StatusAvailable, StatusPartial, StatusUnavailable } from "./status-icon";

type Cell = React.ReactNode;

type Row = {
  label: string;
  cells: Cell[];
};

type Props = {
  columns: string[];
  rows: Row[];
};

function renderCell(cell: Cell) {
  if (cell === "available") return <StatusAvailable />;
  if (cell === "partial") return <StatusPartial />;
  if (cell === "unavailable") return <StatusUnavailable />;
  return cell;
}

export function ComparisonTable({ columns, rows }: Props) {
  const [labelColumn, ...valueColumns] = columns;

  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl border border-border bg-card">
      <div
        className="grid min-w-max text-[13px]"
        style={{
          gridTemplateColumns: `minmax(180px, 1.5fr) repeat(${valueColumns.length}, minmax(130px, 1fr))`,
        }}
      >
        <div className="px-4 py-3 text-left font-semibold text-foreground">{labelColumn}</div>

        {valueColumns.map((column) => (
          <div key={column} className="px-4 py-3 text-left font-semibold text-foreground">
            {column}
          </div>
        ))}

        {rows.map((row) => (
          <div key={row.label} className="contents">
            <div className="px-4 py-3 text-muted-foreground">{row.label}</div>

            {row.cells.map((cell, cellIndex) => (
              <div key={cellIndex} className="flex items-center px-4 py-3 text-foreground">
                {renderCell(cell)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
