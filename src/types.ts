export type CsvDelimiter = "," | ";";

export interface CsvColumn {
  id: string;
  index: number;
  name: string;
  values: Array<number | null>;
}

export interface ParsedCsv {
  delimiter: CsvDelimiter;
  hasHeader: boolean;
  rowCount: number;
  columns: CsvColumn[];
}

export interface CurveConfig {
  id: string;
  label: string;
  xColumnIndex: number;
  yColumnIndex: number;
  color: string;
  enabled: boolean;
}

export interface CurvePoints {
  x: number[];
  y: number[];
}

export interface WorkerCurveInput {
  id: string;
  name: string;
  color: string;
  x: number[];
  y: number[];
}

export interface ReductionRequest {
  curves: WorkerCurveInput[];
  targetPoints: number;
}

export interface ReductionCurveResult {
  id: string;
  name: string;
  color: string;
  y: number[];
  totalAbsoluteError: number;
  rmse: number;
}

export interface ReductionResult {
  sharedX: number[];
  curves: ReductionCurveResult[];
  originalSharedPointCount: number;
  reducedPointCount: number;
}

export interface WorkerSuccessMessage {
  ok: true;
  result: ReductionResult;
}

export interface WorkerErrorMessage {
  ok: false;
  error: string;
}

export type WorkerResponseMessage = WorkerSuccessMessage | WorkerErrorMessage;
