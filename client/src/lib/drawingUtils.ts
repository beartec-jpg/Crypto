/**
 * Utility algorithms for free-draw stroke simplification and curve fitting.
 */

export interface Point2D {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Ramer-Douglas-Peucker polyline simplification (index-based, no float equality)
// ---------------------------------------------------------------------------

function perpendicularDistance(point: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) {
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }
  return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / len;
}

/**
 * Internal: Ramer-Douglas-Peucker operating on a slice of the original index array.
 * Returns the indices (into `points`) that should be kept.
 */
function rdpIndices(points: Point2D[], startIdx: number, endIdx: number, epsilon: number, result: number[]): void {
  if (endIdx <= startIdx + 1) return;

  let maxDist = 0;
  let maxIdx = startIdx;

  for (let i = startIdx + 1; i < endIdx; i++) {
    const dist = perpendicularDistance(points[i], points[startIdx], points[endIdx]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    rdpIndices(points, startIdx, maxIdx, epsilon, result);
    result.push(maxIdx);
    rdpIndices(points, maxIdx, endIdx, epsilon, result);
  }
}

/**
 * Ramer-Douglas-Peucker polyline simplification.
 * Returns the indices into `points` that form the simplified polyline.
 */
export function rdpSimplifyIndices(points: Point2D[], epsilon: number): number[] {
  if (points.length < 2) return points.map((_, i) => i);
  const result: number[] = [0];
  rdpIndices(points, 0, points.length - 1, epsilon, result);
  result.push(points.length - 1);
  result.sort((a, b) => a - b);
  return result;
}

/**
 * Ramer-Douglas-Peucker polyline simplification.
 * Returns the subset of points that represent the polyline within epsilon pixels.
 */
export function rdpSimplify(points: Point2D[], epsilon: number): Point2D[] {
  return rdpSimplifyIndices(points, epsilon).map(i => points[i]);
}

// ---------------------------------------------------------------------------
// Angle-based segment splitter (for line-assisted mode)
// ---------------------------------------------------------------------------

function angleBetweenVectors(v1: Point2D, v2: Point2D): number {
  const dot = v1.x * v2.x + v1.y * v2.y;
  const len1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const len2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  if (len1 === 0 || len2 === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (len1 * len2))));
}

/**
 * Given a set of (already simplified) pixel-space points, returns the indices
 * of breakpoints where the direction changes by more than `angleThresholdDeg`.
 * Always includes index 0 and the last index.
 */
export function findBreakIndices(points: Point2D[], angleThresholdDeg = 25): number[] {
  if (points.length < 3) return [0, points.length - 1];

  const threshold = angleThresholdDeg * (Math.PI / 180);
  const breaks: number[] = [0];

  for (let i = 1; i < points.length - 1; i++) {
    const v1 = { x: points[i].x - points[i - 1].x, y: points[i].y - points[i - 1].y };
    const v2 = { x: points[i + 1].x - points[i].x, y: points[i + 1].y - points[i].y };
    if (angleBetweenVectors(v1, v2) > threshold) {
      breaks.push(i);
    }
  }

  breaks.push(points.length - 1);
  return breaks;
}

// ---------------------------------------------------------------------------
// Catmull-Rom spline helpers (for curve-assisted mode rendering)
// ---------------------------------------------------------------------------

/**
 * Converts adjacent Catmull-Rom spline points to cubic Bézier control points.
 * p0, p1, p2, p3 are consecutive points on the spline.
 * Returns [cp1, cp2] for the segment p1→p2.
 */
export function catmullRomToBezier(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
): [Point2D, Point2D] {
  const cp1: Point2D = {
    x: p1.x + (p2.x - p0.x) / 6,
    y: p1.y + (p2.y - p0.y) / 6,
  };
  const cp2: Point2D = {
    x: p2.x - (p3.x - p1.x) / 6,
    y: p2.y - (p3.y - p1.y) / 6,
  };
  return [cp1, cp2];
}

// ---------------------------------------------------------------------------
// Public simplification helpers used by ChartFullscreenPage
// ---------------------------------------------------------------------------

/**
 * Apply curve simplification to a stroke.
 * Returns indices into `rawPx` that form the simplified curve anchor points.
 */
export function simplifyForCurve(rawPx: Point2D[], epsilon = 6): number[] {
  if (rawPx.length < 2) return rawPx.map((_, i) => i);
  return rdpSimplifyIndices(rawPx, epsilon);
}

/**
 * Apply line-assisted simplification:
 * 1. RDP simplify.
 * 2. Detect angle-based breakpoints within the simplified set.
 * 3. Return the original indices of those breakpoints.
 */
export function simplifyForLine(rawPx: Point2D[], rdpEpsilon = 4, angleThresholdDeg = 25): number[] {
  if (rawPx.length < 2) return rawPx.map((_, i) => i);

  const simplifiedIndices = rdpSimplifyIndices(rawPx, rdpEpsilon);
  if (simplifiedIndices.length < 3) return simplifiedIndices;

  // Build the simplified sub-array for break detection
  const simplifiedPoints = simplifiedIndices.map(i => rawPx[i]);
  const breakPositions = findBreakIndices(simplifiedPoints, angleThresholdDeg);
  // breakPositions are positions within simplifiedIndices array; map back to rawPx indices
  return breakPositions.map(pos => simplifiedIndices[pos]);
}

