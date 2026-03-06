/// <reference lib="webworker" />

import type {
  ReductionRequest,
  ReductionResult,
  WorkerCurveInput,
  WorkerErrorMessage,
  WorkerSuccessMessage,
} from "../types";

interface CurveXY {
  id: string;
  name: string;
  color: string;
  x: number[];
  y: number[];
}

interface HeapNode {
  index: number;
  score: number;
  version: number;
}

class MinHeap {
  private readonly data: HeapNode[] = [];

  get size(): number {
    return this.data.length;
  }

  push(node: HeapNode): void {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapNode | undefined {
    if (this.data.length === 0) {
      return undefined;
    }

    const first = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      this.bubbleDown(0);
    }

    return first;
  }

  private bubbleUp(position: number): void {
    let index = position;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.data[parentIndex].score <= this.data[index].score) {
        break;
      }

      [this.data[parentIndex], this.data[index]] = [this.data[index], this.data[parentIndex]];
      index = parentIndex;
    }
  }

  private bubbleDown(position: number): void {
    let index = position;
    const length = this.data.length;

    while (true) {
      const leftChild = index * 2 + 1;
      const rightChild = leftChild + 1;
      let smallest = index;

      if (leftChild < length && this.data[leftChild].score < this.data[smallest].score) {
        smallest = leftChild;
      }

      if (rightChild < length && this.data[rightChild].score < this.data[smallest].score) {
        smallest = rightChild;
      }

      if (smallest === index) {
        break;
      }

      [this.data[index], this.data[smallest]] = [this.data[smallest], this.data[index]];
      index = smallest;
    }
  }
}

function normalizeCurve(curve: WorkerCurveInput): CurveXY {
  const buckets = new Map<number, { sum: number; count: number }>();
  const pairCount = Math.min(curve.x.length, curve.y.length);

  for (let index = 0; index < pairCount; index += 1) {
    const xValue = curve.x[index];
    const yValue = curve.y[index];
    if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
      continue;
    }

    const existing = buckets.get(xValue);
    if (!existing) {
      buckets.set(xValue, { sum: yValue, count: 1 });
      continue;
    }

    existing.sum += yValue;
    existing.count += 1;
  }

  const sortedX = Array.from(buckets.keys()).sort((left, right) => left - right);
  const sortedY = sortedX.map((xValue) => {
    const bucket = buckets.get(xValue);
    if (!bucket) {
      return NaN;
    }
    return bucket.sum / bucket.count;
  });

  return {
    id: curve.id,
    name: curve.name,
    color: curve.color,
    x: sortedX,
    y: sortedY,
  };
}

function buildUnionX(curves: CurveXY[]): number[] {
  const xSet = new Set<number>();
  for (const curve of curves) {
    for (const value of curve.x) {
      xSet.add(value);
    }
  }

  return Array.from(xSet.values()).sort((left, right) => left - right);
}

function linearInterpolate(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  xTarget: number,
): number {
  const denominator = x1 - x0;
  if (Math.abs(denominator) <= Number.EPSILON) {
    return y0;
  }
  const ratio = (xTarget - x0) / denominator;
  return y0 + ratio * (y1 - y0);
}

function interpolateCurveToGrid(curve: CurveXY, gridX: number[]): number[] {
  if (curve.x.length === 0) {
    return gridX.map(() => NaN);
  }

  if (curve.x.length === 1) {
    return gridX.map(() => curve.y[0]);
  }

  const output: number[] = [];
  let segmentIndex = 0;
  const lastCurveIndex = curve.x.length - 1;

  for (const xTarget of gridX) {
    while (segmentIndex < lastCurveIndex - 1 && curve.x[segmentIndex + 1] < xTarget) {
      segmentIndex += 1;
    }

    if (xTarget <= curve.x[0]) {
      output.push(linearInterpolate(curve.x[0], curve.y[0], curve.x[1], curve.y[1], xTarget));
      continue;
    }

    if (xTarget >= curve.x[lastCurveIndex]) {
      output.push(
        linearInterpolate(
          curve.x[lastCurveIndex - 1],
          curve.y[lastCurveIndex - 1],
          curve.x[lastCurveIndex],
          curve.y[lastCurveIndex],
          xTarget,
        ),
      );
      continue;
    }

    const leftIndex = segmentIndex;
    const rightIndex = leftIndex + 1;
    output.push(
      linearInterpolate(
        curve.x[leftIndex],
        curve.y[leftIndex],
        curve.x[rightIndex],
        curve.y[rightIndex],
        xTarget,
      ),
    );
  }

  return output;
}

function triangleArea(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  return Math.abs((x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1)) * 0.5);
}

function reduceSharedX(
  sharedX: number[],
  interpolatedY: number[][],
  targetPoints: number,
): number[] {
  if (sharedX.length <= 2 || targetPoints >= sharedX.length) {
    return Array.from({ length: sharedX.length }, (_, index) => index);
  }

  const clampedTarget = Math.max(2, targetPoints);
  const itemCount = sharedX.length;
  const prev: number[] = [];
  const next: number[] = [];
  const active: boolean[] = [];
  const version: number[] = [];

  for (let index = 0; index < itemCount; index += 1) {
    prev[index] = index - 1;
    next[index] = index + 1 < itemCount ? index + 1 : -1;
    active[index] = true;
    version[index] = 0;
  }

  const heap = new MinHeap();
  const scoreForIndex = (index: number): number => {
    const left = prev[index];
    const right = next[index];
    if (left < 0 || right < 0) {
      return Number.POSITIVE_INFINITY;
    }

    const x0 = sharedX[left];
    const x1 = sharedX[index];
    const x2 = sharedX[right];
    let score = 0;

    for (const ySeries of interpolatedY) {
      score += triangleArea(x0, ySeries[left], x1, ySeries[index], x2, ySeries[right]);
    }

    return score;
  };

  for (let index = 1; index < itemCount - 1; index += 1) {
    heap.push({ index, score: scoreForIndex(index), version: 0 });
  }

  let activeCount = itemCount;
  while (activeCount > clampedTarget && heap.size > 0) {
    const current = heap.pop();
    if (!current) {
      break;
    }

    const { index } = current;
    if (!active[index]) {
      continue;
    }
    if (current.version !== version[index]) {
      continue;
    }

    const left = prev[index];
    const right = next[index];
    if (left < 0 || right < 0) {
      continue;
    }

    active[index] = false;
    activeCount -= 1;

    next[left] = right;
    prev[right] = left;

    if (left > 0 && active[left]) {
      version[left] += 1;
      heap.push({ index: left, score: scoreForIndex(left), version: version[left] });
    }
    if (right > 0 && right < itemCount - 1 && active[right]) {
      version[right] += 1;
      heap.push({ index: right, score: scoreForIndex(right), version: version[right] });
    }
  }

  const keptIndices: number[] = [];
  let cursor = 0;
  while (cursor !== -1) {
    if (active[cursor]) {
      keptIndices.push(cursor);
    }
    cursor = next[cursor];
  }

  return keptIndices;
}

function runReduction(request: ReductionRequest): ReductionResult {
  const cleanCurves = request.curves
    .map(normalizeCurve)
    .filter((curve) => curve.x.length > 0 && curve.y.length > 0);

  if (cleanCurves.length === 0) {
    throw new Error("No hay curvas válidas para procesar.");
  }

  const sharedX = buildUnionX(cleanCurves);
  if (sharedX.length === 0) {
    throw new Error("No se pudo construir una malla común de X.");
  }

  const interpolatedY = cleanCurves.map((curve) => interpolateCurveToGrid(curve, sharedX));

  const targetPoints = Math.floor(request.targetPoints);
  if (!Number.isFinite(targetPoints) || targetPoints < 2) {
    throw new Error("El número final de puntos debe ser 2 o mayor.");
  }

  const keptIndices = reduceSharedX(sharedX, interpolatedY, targetPoints);
  const reducedX = keptIndices.map((index) => sharedX[index]);
  const reducedCurves = cleanCurves.map((curve, curveIndex) => ({
    id: curve.id,
    name: curve.name,
    color: curve.color,
    y: keptIndices.map((index) => interpolatedY[curveIndex][index]),
  }));

  return {
    sharedX: reducedX,
    curves: reducedCurves,
    originalSharedPointCount: sharedX.length,
    reducedPointCount: reducedX.length,
  };
}

const workerContext: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

workerContext.onmessage = (event: MessageEvent<ReductionRequest>) => {
  try {
    const result = runReduction(event.data);
    const message: WorkerSuccessMessage = {
      ok: true,
      result,
    };
    workerContext.postMessage(message);
  } catch (error) {
    const message: WorkerErrorMessage = {
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido al reducir los datos.",
    };
    workerContext.postMessage(message);
  }
};
