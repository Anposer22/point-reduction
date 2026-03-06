import type { CsvColumn, CurvePoints } from "../types";

export function extractCurvePoints(
  columns: CsvColumn[],
  xColumnIndex: number,
  yColumnIndex: number,
): CurvePoints {
  const xColumn = columns[xColumnIndex];
  const yColumn = columns[yColumnIndex];

  if (!xColumn || !yColumn) {
    return { x: [], y: [] };
  }

  const length = Math.min(xColumn.values.length, yColumn.values.length);
  const points: Array<{ x: number; y: number }> = [];

  for (let index = 0; index < length; index += 1) {
    const xValue = xColumn.values[index];
    const yValue = yColumn.values[index];

    if (xValue === null || yValue === null) {
      continue;
    }

    if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
      continue;
    }

    points.push({ x: xValue, y: yValue });
  }

  points.sort((left, right) => left.x - right.x);
  return {
    x: points.map((point) => point.x),
    y: points.map((point) => point.y),
  };
}

export function getCurvePointCount(
  columns: CsvColumn[],
  xColumnIndex: number,
  yColumnIndex: number,
): number {
  return extractCurvePoints(columns, xColumnIndex, yColumnIndex).x.length;
}
