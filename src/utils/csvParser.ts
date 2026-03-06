import Papa from "papaparse";
import type { CsvColumn, CsvDelimiter, ParsedCsv } from "../types";

const AUTO_COLUMN_PREFIX = "Column";

function countDelimiterInLine(line: string, delimiter: CsvDelimiter): number {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const current = line[index];
    if (current === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && current === delimiter) {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(rawCsv: string): CsvDelimiter {
  const sampleLines = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);

  if (sampleLines.length === 0) {
    return ",";
  }

  let commaScore = 0;
  let semicolonScore = 0;
  for (const line of sampleLines) {
    commaScore += countDelimiterInLine(line, ",");
    semicolonScore += countDelimiterInLine(line, ";");
  }

  return semicolonScore > commaScore ? ";" : ",";
}

function parseNumericCell(value: string, delimiter: CsvDelimiter): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withoutSpaces = trimmed.replace(/\s+/g, "");
  const normalized =
    delimiter === ";" && withoutSpaces.includes(",") && !withoutSpaces.includes(".")
      ? withoutSpaces.replace(",", ".")
      : withoutSpaces;

  const asNumber = Number(normalized);
  return Number.isFinite(asNumber) ? asNumber : null;
}

function numericRatio(cells: string[]): number {
  if (cells.length === 0) {
    return 0;
  }

  const numericCells = cells.reduce((acc, cell) => {
    const value = cell.trim();
    if (!value) {
      return acc;
    }

    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? acc + 1 : acc;
  }, 0);

  return numericCells / cells.length;
}

function hasLikelyHeader(rows: string[][]): boolean {
  if (rows.length < 2) {
    return false;
  }

  const first = rows[0];
  const second = rows[1];

  const firstRatio = numericRatio(first);
  const secondRatio = numericRatio(second);
  const firstHasLetters = first.some((cell) => /[A-Za-z]/.test(cell));

  return firstHasLetters && firstRatio < 0.6 && secondRatio >= firstRatio + 0.2;
}

function createColumns(
  rows: string[][],
  delimiter: CsvDelimiter,
  withHeader: boolean,
): CsvColumn[] {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (columnCount === 0) {
    return [];
  }

  const header = withHeader ? rows[0] : [];
  const dataRows = withHeader ? rows.slice(1) : rows;

  const columns: CsvColumn[] = Array.from({ length: columnCount }, (_, index) => {
    const headerName = header[index]?.trim();
    return {
      id: `column-${index + 1}`,
      index,
      name: headerName || `${AUTO_COLUMN_PREFIX}_${index + 1}`,
      values: [],
    };
  });

  for (const row of dataRows) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cell = row[columnIndex] ?? "";
      columns[columnIndex].values.push(parseNumericCell(cell, delimiter));
    }
  }

  return columns;
}

export function parseCsvContent(rawCsv: string): ParsedCsv {
  if (!rawCsv.trim()) {
    throw new Error("El archivo CSV está vacío.");
  }

  const delimiter = detectDelimiter(rawCsv);
  const parseResult = Papa.parse<string[]>(rawCsv, {
    delimiter,
    skipEmptyLines: "greedy",
  });

  if (parseResult.errors.length > 0) {
    const firstError = parseResult.errors[0];
    throw new Error(`Error al leer CSV: ${firstError.message}`);
  }

  const rows = parseResult.data.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (rows.length === 0) {
    throw new Error("No se encontraron filas útiles en el CSV.");
  }

  const withHeader = hasLikelyHeader(rows);
  const columns = createColumns(rows, delimiter, withHeader);
  if (columns.length === 0) {
    throw new Error("No se pudieron detectar columnas en el CSV.");
  }

  return {
    delimiter,
    hasHeader: withHeader,
    rowCount: withHeader ? rows.length - 1 : rows.length,
    columns,
  };
}
