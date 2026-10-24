/**
 * Graphiques en SVG pur, rendus côté serveur (aucune librairie).
 *
 * Le détail qui compte : les DÉPLOIEMENTS sont tracés sur chaque courbe
 * (trait ambre + version). Une marche dans une courbe ne veut rien dire
 * tant qu'on ne voit pas ce qui a changé à ce moment-là.
 */

export interface Series {
  label: string;
  color: string;
  values: Array<number | null>;
  dashed?: boolean;
}

export interface Marker {
  /** Index (fractionnaire) sur l'axe des x. */
  at: number;
  label: string;
}

const W = 560;
const H = 170;
const PAD = { top: 12, right: 12, bottom: 22, left: 46 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function pathFor(values: Array<number | null>, x: (i: number) => number, y: (v: number) => number): string {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    pen = true;
  });
  return d.trim();
}

export function LineChart({
  title, subtitle, series, xLabels, markers = [], format, minMax,
}: {
  title: string;
  subtitle?: string;
  series: Series[];
  xLabels: string[];
  markers?: Marker[];
  format: (v: number) => string;
  /** Plancher pour le max de l'axe y (évite d'exagérer un bruit minuscule). */
  minMax?: number;
}) {
  const n = Math.max(xLabels.length, 1);
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v));
  const max = niceMax(Math.max(minMax ?? 0, ...all, 0));
  const x = (i: number) => PAD.left + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(n / 6));
  const last = series[0]?.values.filter((v) => v !== null).at(-1) ?? null;

  return (
    <figure className="chart panel panel-pad" style={{ margin: 0 }}>
      <figcaption className="chart-title">
        <strong>{title}</strong>
        <span className="mono faint">{subtitle ?? (last !== null ? format(last) : '—')}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#1F2328" />
            <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {xLabels.map((l, i) =>
          (i % labelEvery === 0 && (i === n - 1 || n - 1 - i >= labelEvery * 0.6)) || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{l}</text>
          ) : null,
        )}
        {markers.map((m) => (
          <g key={`${m.label}-${m.at}`}>
            <line x1={x(m.at)} x2={x(m.at)} y1={PAD.top} y2={H - PAD.bottom} stroke="#FFB224" strokeDasharray="3 3" opacity={0.8} />
            <text x={x(m.at) + 4} y={PAD.top + 9} style={{ fill: '#FFB224' }}>{m.label}</text>
          </g>
        ))}
        {series.map((s) => (
          <path key={s.label} d={pathFor(s.values, x, y)} fill="none" stroke={s.color} strokeWidth={1.8}
            strokeDasharray={s.dashed ? '4 3' : undefined} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {series.map((s) =>
          s.values.map((v, i) =>
            v !== null && (s.values[i - 1] ?? null) === null && (s.values[i + 1] ?? null) === null ? (
              <circle key={`${s.label}-${i}`} cx={x(i)} cy={y(v)} r={2} fill={s.color} />
            ) : null,
          ),
        )}
      </svg>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>
          ))}
        </div>
      )}
    </figure>
  );
}

export function Sparkline({ values, color = '#A9AFB8', width = 120, height = 28, label }: {
  values: Array<number | null>;
  color?: string;
  width?: number;
  height?: number;
  label: string;
}) {
  const nums = values.filter((v): v is number => v !== null);
  const max = Math.max(...nums, 0) || 1;
  const n = values.length;
  const x = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * (width - 2)) + 1;
  const y = (v: number) => 2 + (1 - v / max) * (height - 4);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke="#1F2328" />
      <path d={pathFor(values, x, y)} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
