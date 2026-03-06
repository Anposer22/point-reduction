import { useMemo } from "react";
import type { CsvColumn, CurveConfig, ReductionResult } from "../types";
import { extractCurvePoints } from "../utils/curveData";

interface DataPreviewProps {
  columns: CsvColumn[];
  curves: CurveConfig[];
  reductionResult: ReductionResult | null;
  onCurveChange: (curveId: string, patch: Partial<CurveConfig>) => void;
  onSwapAxes: (curveId: string) => void;
}

interface PreviewRow {
  x: number;
  y: number;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(6);
}

function getPreviewRows(
  columns: CsvColumn[],
  xColumnIndex: number,
  yColumnIndex: number,
  limit: number,
): PreviewRow[] {
  const xColumn = columns[xColumnIndex];
  const yColumn = columns[yColumnIndex];
  if (!xColumn || !yColumn) {
    return [];
  }

  const rows: PreviewRow[] = [];
  const rowCount = Math.min(xColumn.values.length, yColumn.values.length);

  for (let index = 0; index < rowCount && rows.length < limit; index += 1) {
    const xValue = xColumn.values[index];
    const yValue = yColumn.values[index];

    if (xValue === null || yValue === null) {
      continue;
    }
    if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
      continue;
    }

    rows.push({ x: xValue, y: yValue });
  }

  return rows;
}

export default function DataPreview({
  columns,
  curves,
  reductionResult,
  onCurveChange,
  onSwapAxes,
}: DataPreviewProps) {
  const optionItems = useMemo(
    () =>
      columns.map((column) => ({
        value: column.index,
        label: column.name,
      })),
    [columns],
  );

  const reducedCurveById = useMemo(
    () => new Map(reductionResult?.curves.map((curve) => [curve.id, curve]) ?? []),
    [reductionResult],
  );

  if (curves.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        No column pairs are available.
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {curves.map((curve) => {
        const points = extractCurvePoints(columns, curve.xColumnIndex, curve.yColumnIndex);
        const previewRows = getPreviewRows(columns, curve.xColumnIndex, curve.yColumnIndex, 5);
        const xName = columns[curve.xColumnIndex]?.name ?? "N/A";
        const yName = columns[curve.yColumnIndex]?.name ?? "N/A";
        const reducedStats = reducedCurveById.get(curve.id);

        return (
          <section
            key={curve.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">{curve.label}</h3>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={curve.enabled}
                  onChange={(event) =>
                    onCurveChange(curve.id, { enabled: event.target.checked })
                  }
                />
                Include
              </label>
            </div>

            <div className="mb-3 grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                X column
                <select
                  className="rounded-md border border-slate-300 p-2"
                  value={curve.xColumnIndex}
                  onChange={(event) =>
                    onCurveChange(curve.id, {
                      xColumnIndex: Number(event.target.value),
                    })
                  }
                >
                  {optionItems.map((option) => (
                    <option key={`${curve.id}-x-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Y column
                <select
                  className="rounded-md border border-slate-300 p-2"
                  value={curve.yColumnIndex}
                  onChange={(event) =>
                    onCurveChange(curve.id, {
                      yColumnIndex: Number(event.target.value),
                    })
                  }
                >
                  {optionItems.map((option) => (
                    <option key={`${curve.id}-y-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                Color
                <input
                  type="color"
                  value={curve.color}
                  onChange={(event) => onCurveChange(curve.id, { color: event.target.value })}
                />
              </label>

              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-100"
                onClick={() => onSwapAxes(curve.id)}
              >
                Swap X/Y
              </button>

              <span className="text-sm text-slate-600">
                Valid points total: <strong>{points.x.length}</strong>
              </span>
            </div>

            {reducedStats && (
              <p className="mb-3 text-sm text-emerald-700">
                Reduction total error (L1):{" "}
                <strong>{reducedStats.totalAbsoluteError.toFixed(6)}</strong>
                {" · "}
                RMSE: <strong>{reducedStats.rmse.toFixed(6)}</strong>
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="border border-slate-200 px-2 py-1 text-left">{xName} (X)</th>
                    <th className="border border-slate-200 px-2 py-1 text-left">{yName} (Y)</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2}
                        className="border border-slate-200 px-2 py-2 text-slate-500"
                      >
                        This pair has no valid numeric data.
                      </td>
                    </tr>
                  ) : (
                    previewRows.map((row, rowIndex) => (
                      <tr key={`${curve.id}-row-${rowIndex}`}>
                        <td className="border border-slate-200 px-2 py-1">
                          {formatValue(row.x)}
                        </td>
                        <td className="border border-slate-200 px-2 py-1">
                          {formatValue(row.y)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
