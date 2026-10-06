"use client";

import { useState } from "react";
import { formatOneDecimal, type CalculatedRvuStaffingRow } from "@/lib/metrics/rvu-staffing";

const shifts = ["day", "night"] as const;

function formatReportingDate(value: string, short = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", ...(short ? {} : { year: "numeric" as const }), timeZone: "UTC"
  }).format(new Date(`${value}T12:00:00Z`));
}

// Each point is an existing reporting window; no daily averaging or new metrics.
function TrendPlot({ rows, staffing = false }: { rows: CalculatedRvuStaffingRow[]; staffing?: boolean }) {
  const id = staffing ? "staffing" : "rvu";
  const width = 560;
  const height = 260;
  const left = 48;
  const right = 20;
  const top = 20;
  const bottom = 48;
  const timestamp = (row: CalculatedRvuStaffingRow) => Date.parse(`${row.shift_date}T00:00:00Z`) + (row.shift_type === "night" ? 43200000 : 0);
  const first = timestamp(rows[0]);
  const last = timestamp(rows[rows.length - 1]);
  const x = (row: CalculatedRvuStaffingRow) => first === last ? (width + left - right) / 2 : left + (timestamp(row) - first) / (last - first) * (width - left - right);
  const series = staffing ? [
    { label: "RTs Needed", color: "#0e7490", dashed: false, rows, value: (row: CalculatedRvuStaffingRow) => row.exactRtsNeeded },
    { label: "RTs On Shift", color: "#2563eb", dashed: true, rows, value: (row: CalculatedRvuStaffingRow) => row.rts_on }
  ] : shifts.map((shift) => ({
    label: shift === "day" ? "Day Shift" : "Night Shift", color: shift === "day" ? "#0284c7" : "#7c3aed", dashed: shift === "night",
    rows: rows.filter((row) => row.shift_type === shift), value: (row: CalculatedRvuStaffingRow) => row.rvuTotal
  }));
  const maxValue = series.reduce((max, item) => item.rows.reduce((value, row) => Math.max(value, item.value(row)), max), 0);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, maxValue / 4)));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= maxValue / 4) ?? magnitude * 10;
  const maximum = step * 4;
  const y = (value: number) => height - bottom - value / maximum * (height - top - bottom);
  const labelRows = Array.from(new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])).map((index) => rows[index]);

  return <>
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-600">
      {series.map((item) => <span key={item.label} className="inline-flex items-center gap-2">
        <span aria-hidden="true" className="w-5 border-t-[3px]" style={{ borderColor: item.color, borderStyle: item.dashed ? "dashed" : "solid" }} />{item.label}
      </span>)}
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`} className="mt-4 h-auto w-full">
      <title id={`${id}-title`}>{staffing ? "Staffing trend by reporting window" : "RVU trend by reporting window"}</title>
      <desc id={`${id}-description`}>{staffing ? "RTs Needed and RTs On Shift for each reported shift, in date order." : "Separate Day and Night RVU totals, in date order."} Missing reports are not zeroes. Exact values are in Reporting-Window Detail below.</desc>
      {[0, 1, 2, 3, 4].map((index) => <g key={index}>
        <line x1={left} x2={width - right} y1={y(index * step)} y2={y(index * step)} stroke="#e2e8f0" />
        <text x={left - 10} y={y(index * step) + 4} textAnchor="end" fill="#64748b" fontSize="12">{index * step}</text>
      </g>)}
      {series.map((item) => {
        // Break the line across missing reporting windows instead of implying data exists.
        const segments: CalculatedRvuStaffingRow[][] = [];
        const interval = staffing && rows.some((row) => row.shift_type !== rows[0].shift_type) ? 43200000 : 86400000;
        item.rows.forEach((row, index) => {
          if (index === 0 || timestamp(row) - timestamp(item.rows[index - 1]) > interval) segments.push([]);
          segments[segments.length - 1].push(row);
        });
        return <g key={item.label}>
          {segments.map((segment) => <polyline key={segment[0].id} points={segment.map((row) => `${x(row)},${y(item.value(row))}`).join(" ")} fill="none" stroke={item.color} strokeWidth="2.5" strokeDasharray={item.dashed ? "6 4" : undefined} strokeLinecap="round" strokeLinejoin="round" />)}
          {item.rows.map((row) => <circle key={row.id} cx={x(row)} cy={y(item.value(row))} r={rows.length > 90 ? 2 : 3.5} fill={item.color}>
            <title>{`${formatReportingDate(row.shift_date)} · ${row.shift_type === "day" ? "Day" : "Night"} · ${item.label}: ${formatOneDecimal(item.value(row))}`}</title>
          </circle>)}
        </g>;
      })}
      {labelRows.map((row, index) => <text key={row.id} x={x(row)} y={height - 15} textAnchor={labelRows.length === 1 ? "middle" : index === 0 ? "start" : index === labelRows.length - 1 ? "end" : "middle"} fill="#64748b" fontSize="12">{formatReportingDate(row.shift_date, true)}</text>)}
    </svg>
  </>;
}

export function RvuStaffingTrendChart({ rows, staffing = false }: { rows: CalculatedRvuStaffingRow[]; staffing?: boolean }) {
  const [selectedShift, setSelectedShift] = useState<"day" | "night">("day");
  const availableShifts = shifts.filter((shift) => rows.some((row) => row.shift_type === shift));
  const activeShift = availableShifts.includes(selectedShift) ? selectedShift : availableShifts[0];
  const chartRows = staffing ? rows.filter((row) => row.shift_type === activeShift) : rows;
  return <>
    {staffing && <div className="mt-3 flex items-center gap-2" role="group" aria-label="Staffing trend shift">
      {availableShifts.map((shift) => <button key={shift} type="button" aria-pressed={activeShift === shift} onClick={() => setSelectedShift(shift)} className={`min-h-11 rounded-xl border px-4 text-xs font-bold ${activeShift === shift ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{shift === "day" ? "Day Shift" : "Night Shift"}</button>)}
    </div>}
    {chartRows.length > 0 && <TrendPlot rows={chartRows} staffing={staffing} />}
  </>;
}
