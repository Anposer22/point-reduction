import type { ReductionResult } from "../types";

function sanitizeHeader(value: string): string {
  return value.trim().replace(/[\r\n;]+/g, "_");
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  return `${value}`;
}

export function buildReducedCsv(result: ReductionResult): string {
  const headers = ["X_Comun", ...result.curves.map((curve) => sanitizeHeader(curve.name))];
  const rows: string[] = [headers.join(";")];

  for (let index = 0; index < result.sharedX.length; index += 1) {
    const values = [formatNumber(result.sharedX[index])];
    for (const curve of result.curves) {
      values.push(formatNumber(curve.y[index]));
    }
    rows.push(values.join(";"));
  }

  return rows.join("\n");
}

export function downloadCsv(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
