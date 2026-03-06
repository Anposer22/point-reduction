import { useMemo } from "react";
import Plot from "react-plotly.js";
import type { Data, Layout } from "plotly.js";
import type { CsvColumn, CurveConfig, ReductionResult } from "../types";
import { extractCurvePoints } from "../utils/curveData";

interface ChartProps {
  columns: CsvColumn[];
  curves: CurveConfig[];
  reductionResult: ReductionResult | null;
}

export default function Chart({ columns, curves, reductionResult }: ChartProps) {
  const traces = useMemo<Data[]>(() => {
    const lines: Data[] = [];
    const reducedByCurveId = new Map(
      reductionResult?.curves.map((curve) => [curve.id, curve]) ?? [],
    );

    for (const curve of curves) {
      if (!curve.enabled) {
        continue;
      }

      const original = extractCurvePoints(columns, curve.xColumnIndex, curve.yColumnIndex);
      if (original.x.length === 0) {
        continue;
      }

      lines.push({
        type: "scatter",
        mode: "lines",
        name: reductionResult ? `${curve.label} (original)` : curve.label,
        x: original.x,
        y: original.y,
        line: {
          color: curve.color,
          width: 2,
        },
        opacity: reductionResult ? 0.35 : 1,
      });

      const reduced = reducedByCurveId.get(curve.id);
      if (!reduced || !reductionResult) {
        continue;
      }

      lines.push({
        type: "scatter",
        mode: "lines+markers",
        name: `${curve.label} (reduced)`,
        x: reductionResult.sharedX,
        y: reduced.y,
        line: {
          color: curve.color,
          width: 3,
          dash: "dot",
        },
        marker: {
          color: curve.color,
          size: 6,
        },
      });
    }

    return lines;
  }, [columns, curves, reductionResult]);

  const layout = useMemo<Partial<Layout>>(
    () => ({
      autosize: true,
      paper_bgcolor: "white",
      plot_bgcolor: "white",
      margin: { t: 20, r: 20, b: 45, l: 50 },
      xaxis: { title: { text: "X" } },
      yaxis: { title: { text: "Y" } },
      legend: { orientation: "h", y: -0.25 },
      hovermode: "closest",
    }),
    [],
  );

  if (traces.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Upload a CSV and enable at least one pair with valid numeric data to display the chart.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <Plot
        data={traces}
        layout={layout}
        style={{ width: "100%", height: "480px" }}
        config={{ responsive: true, displaylogo: false }}
      />
    </div>
  );
}
