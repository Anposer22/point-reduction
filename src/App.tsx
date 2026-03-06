import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "./components/Chart";
import DataPreview from "./components/DataPreview";
import type {
  CurveConfig,
  ParsedCsv,
  ReductionRequest,
  ReductionResult,
  WorkerResponseMessage,
} from "./types";
import { extractCurvePoints } from "./utils/curveData";
import { parseCsvContent } from "./utils/csvParser";
import { buildReducedCsv, downloadCsv } from "./utils/csvExport";

const DEFAULT_COLORS = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#17becf",
];

function createDefaultCurves(columnCount: number): CurveConfig[] {
  const pairCount = Math.floor(columnCount / 2);
  return Array.from({ length: pairCount }, (_, index) => ({
    id: `curve-${index + 1}`,
    label: `Par ${index + 1}`,
    xColumnIndex: index * 2,
    yColumnIndex: index * 2 + 1,
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    enabled: true,
  }));
}

function getBaseName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "resultados";
  }
  return trimmed.replace(/\.[^/.]+$/, "");
}

export default function App() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null);
  const [curveConfigs, setCurveConfigs] = useState<CurveConfig[]>([]);
  const [targetPoints, setTargetPoints] = useState<number>(20);
  const [result, setResult] = useState<ReductionResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [ignoredColumnName, setIgnoredColumnName] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedCurvesInput = useMemo(() => {
    if (!parsedCsv) {
      return [];
    }

    return curveConfigs
      .filter((curve) => curve.enabled)
      .map((curve) => {
        const points = extractCurvePoints(parsedCsv.columns, curve.xColumnIndex, curve.yColumnIndex);
        return {
          id: curve.id,
          name: curve.label,
          color: curve.color,
          x: points.x,
          y: points.y,
        };
      })
      .filter((curve) => curve.x.length > 0 && curve.y.length > 0);
  }, [curveConfigs, parsedCsv]);

  const runReductionInWorker = (payload: ReductionRequest): Promise<ReductionResult> =>
    new Promise((resolve, reject) => {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL("./workers/reduction.worker.ts", import.meta.url), {
          type: "module",
        });
      }

      const worker = workerRef.current;
      worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
        if (event.data.ok) {
          resolve(event.data.result);
        } else {
          reject(new Error(event.data.error));
        }
      };

      worker.onerror = () => {
        reject(new Error("Error inesperado en el procesamiento de datos."));
      };

      worker.postMessage(payload);
    });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setErrorMessage(null);
    setResult(null);
    setIsRunning(false);
    setFileName(file.name);

    try {
      const rawText = await file.text();
      const parsed = parseCsvContent(rawText);
      if (parsed.columns.length < 2) {
        throw new Error("El CSV debe tener al menos dos columnas para crear pares X/Y.");
      }

      const curves = createDefaultCurves(parsed.columns.length);
      if (curves.length === 0) {
        throw new Error("No se detectaron pares completos de columnas.");
      }

      setParsedCsv(parsed);
      setCurveConfigs(curves);
      setIgnoredColumnName(
        parsed.columns.length % 2 === 1 ? parsed.columns[parsed.columns.length - 1].name : null,
      );
    } catch (error) {
      setParsedCsv(null);
      setCurveConfigs([]);
      setIgnoredColumnName(null);
      setErrorMessage(error instanceof Error ? error.message : "No se pudo procesar el CSV.");
    }
  };

  const updateCurve = (curveId: string, patch: Partial<CurveConfig>) => {
    setCurveConfigs((previous) =>
      previous.map((curve) => (curve.id === curveId ? { ...curve, ...patch } : curve)),
    );
    setResult(null);
  };

  const swapCurveAxes = (curveId: string) => {
    setCurveConfigs((previous) =>
      previous.map((curve) => {
        if (curve.id !== curveId) {
          return curve;
        }
        return {
          ...curve,
          xColumnIndex: curve.yColumnIndex,
          yColumnIndex: curve.xColumnIndex,
        };
      }),
    );
    setResult(null);
  };

  const handleRun = async () => {
    if (!parsedCsv) {
      setErrorMessage("Primero carga un archivo CSV.");
      return;
    }

    const target = Math.floor(targetPoints);
    if (!Number.isFinite(target) || target < 2) {
      setErrorMessage("El número de puntos finales debe ser 2 o mayor.");
      return;
    }

    if (selectedCurvesInput.length === 0) {
      setErrorMessage("No hay curvas habilitadas con datos numéricos válidos.");
      return;
    }

    setErrorMessage(null);
    setIsRunning(true);

    try {
      const reduced = await runReductionInWorker({
        curves: selectedCurvesInput,
        targetPoints: target,
      });
      setResult(reduced);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No fue posible completar la reducción.",
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownload = () => {
    if (!result) {
      return;
    }

    const content = buildReducedCsv(result);
    const downloadName = `${getBaseName(fileName)}_reduced.csv`;
    downloadCsv(content, downloadName);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-8">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-bold">Point Reduction Web Application</h1>
          <p className="mt-2 text-sm text-slate-600">
            Sube un CSV (`,` o `;`, con o sin cabeceras), revisa las curvas por pares, ejecuta
            interpolación + reducción y descarga el resultado final en CSV separado por `;`.
          </p>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              Archivo CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="rounded-md border border-slate-300 p-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-slate-700">
              Puntos finales (N)
              <input
                type="number"
                min={2}
                step={1}
                value={targetPoints}
                onChange={(event) => setTargetPoints(Number(event.target.value))}
                className="w-32 rounded-md border border-slate-300 p-2"
              />
            </label>

            <button
              type="button"
              onClick={handleRun}
              disabled={!parsedCsv || isRunning}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isRunning ? "Procesando..." : "RUN"}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={!result}
              className="rounded-md border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              Descargar CSV (;)
            </button>
          </div>

          {parsedCsv && (
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-700">
              <span>
                Delimitador detectado: <strong>{parsedCsv.delimiter}</strong>
              </span>
              <span>
                Cabeceras detectadas: <strong>{parsedCsv.hasHeader ? "Sí" : "No"}</strong>
              </span>
              <span>
                Filas de datos: <strong>{parsedCsv.rowCount}</strong>
              </span>
              <span>
                Curvas habilitadas para RUN: <strong>{selectedCurvesInput.length}</strong>
              </span>
            </div>
          )}

          {ignoredColumnName && (
            <p className="mt-3 text-sm text-amber-700">
              Se detectó una columna sin pareja y no se creó curva por defecto para ella:{" "}
              <strong>{ignoredColumnName}</strong>.
            </p>
          )}

          {result && (
            <p className="mt-3 text-sm text-emerald-700">
              RUN completado: malla común inicial de <strong>{result.originalSharedPointCount}</strong>{" "}
              puntos X, reducida a <strong>{result.reducedPointCount}</strong> puntos.
            </p>
          )}

          {errorMessage && (
            <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>
          )}
        </section>

        {parsedCsv && (
          <DataPreview
            columns={parsedCsv.columns}
            curves={curveConfigs}
            onCurveChange={updateCurve}
            onSwapAxes={swapCurveAxes}
          />
        )}

        <section>
          <Chart columns={parsedCsv?.columns ?? []} curves={curveConfigs} reductionResult={result} />
        </section>
      </div>
    </main>
  );
}
