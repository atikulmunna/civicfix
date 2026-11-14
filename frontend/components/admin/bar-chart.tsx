/** Minimal dependency-free horizontal bar chart. */
export function BarChart({
  data,
  color = 'bg-teal-600',
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="text-sm text-slate-500">No data.</p>;
  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-sm">
          <span className="w-32 shrink-0 truncate text-slate-600">{d.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
            <div className={`h-full ${color}`} style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right tabular-nums text-slate-700">{d.value}</span>
        </div>
      ))}
    </div>
  );
}
