/**
 * Utility algorithms for free-draw stroke simplification and curve fitting.
 */

export interface Point2D {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Ramer-Douglas-Peucker polyline simplification
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
 * Ramer-Douglas-Peucker polyline simplification.
 * Returns the subset of points that represent the polyline within epsilon pixels.
 */
export function rdpSimplify(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length < 3) return [...points];

  let maxDist = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIndex + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
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

/**
 * Apply curve simplification to a stroke:
 * 1. RDP simplify the raw pixel points with a generous epsilon.
 * 2. Return the subset indices into the original time/price array.
 *
 * The caller maps those indices back to their (time, price) counterparts.
 */
export function simplifyForCurve(rawPx: Point2D[], epsilon = 6): number[] {
  if (rawPx.length < 2) return rawPx.map((_, i) => i);

  // RDP on raw points - returns the simplified Point2Ds
  const simplified = rdpSimplify(rawPx, epsilon);

  // Map simplified points back to original indices
  const indices: number[] = [];
  let searchFrom = 0;
  for (const sp of simplified) {
    for (let i = searchFrom; i < rawPx.length; i++) {
      if (rawPx[i].x === sp.x && rawPx[i].y === sp.y) {
        indices.push(i);
        searchFrom = i + 1;
        break;
      }
    }
  }
  return indices;
}

/**
 * Apply line-assisted simplification:
 * 1. RDP simplify.
 * 2. Detect angle-based breakpoints.
 * 3. Return the union of breakpoints (these are the anchor vertices of straight segments).
 */
export function simplifyForLine(rawPx: Point2D[], rdpEpsilon = 4, angleThresholdDeg = 25): number[] {
  if (rawPx.length < 2) return rawPx.map((_, i) => i);

  const simplified = rdpSimplify(rawPx, rdpEpsilon);

  // Map simplified points back to original indices
  const simplifiedIndices: number[] = [];
  let searchFrom = 0;
  for (const sp of simplified) {
    for (let i = searchFrom; i < rawPx.length; i++) {
      if (rawPx[i].x === sp.x && rawPx[i].y === sp.y) {
        simplifiedIndices.push(i);
        searchFrom = i + 1;
        break;
      }
    }
  }

  if (simplifiedIndices.length < 3) return simplifiedIndices;

  // Now find breakpoints within the simplified set
  const simplifiedPoints = simplifiedIndices.map(i => rawPx[i]);
  const breakPositions = findBreakIndices(simplifiedPoints, angleThresholdDeg);
  // breakPositions are indices into simplifiedIndices array
  return breakPositions.map(pos => simplifiedIndices[pos]);
}
