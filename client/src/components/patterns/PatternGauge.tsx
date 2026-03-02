interface PatternGaugeProps {
  score: number;
}

function gaugeColor(score: number): string {
  if (score >= 80) return '#22c55e';  // green-500
  if (score >= 70) return '#10b981';  // emerald-500
  if (score >= 50) return '#eab308';  // yellow-500
  if (score >= 35) return '#f97316';  // orange-500
  return '#64748b';                    // slate-500
}

export function PatternGauge({ score }: PatternGaugeProps) {
  const cx = 60;
  const cy = 68;
  const r = 48;
  const s = Math.max(0, Math.min(100, score));

  // Background arc: full semi-circle from left (180°) to right (0°) through top
  const bgPath = `M ${cx - r},${cy} A ${r},${r} 0 0,0 ${cx + r},${cy}`;

  // Foreground arc: fill from left up to score position
  // End angle in standard-math coords: 180° → 0° as score goes 0 → 100
  const endAngleDeg = 180 - (s / 100) * 180;
  const endAngleRad = endAngleDeg * (Math.PI / 180);
  const endX = cx + r * Math.cos(endAngleRad);
  const endY = cy - r * Math.sin(endAngleRad);

  // sweep=0 (CCW in SVG = visually goes upward from left through top to right)
  // large-arc=0 since arc always spans ≤ 180°
  const fgPath =
    s > 0
      ? `M ${cx - r},${cy} A ${r},${r} 0 0,0 ${endX.toFixed(2)},${endY.toFixed(2)}`
      : null;

  const color = gaugeColor(s);

  return (
    <svg viewBox="0 0 120 74" className="w-full" aria-hidden="true">
      {/* Background track */}
      <path d={bgPath} fill="none" stroke="#1e293b" strokeWidth="9" strokeLinecap="round" />
      {/* Score fill */}
      {fgPath && (
        <path d={fgPath} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" />
      )}
    </svg>
  );
}
