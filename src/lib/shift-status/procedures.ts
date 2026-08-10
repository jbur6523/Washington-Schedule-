import type { ShiftStatusUpdate } from "@/lib/shift-status/types";

export type ProcedureCounts = {
  cSections: number;
  vaginalDelivery: number;
  cabg: number;
  bronchs: number;
  sputumInductions: number;
  other: number;
  note: string | null;
};

export function procedureCounts(update: ShiftStatusUpdate | null): ProcedureCounts {
  return {
    cSections: update?.c_section_count ?? 0,
    vaginalDelivery: update?.vaginal_delivery_count ?? 0,
    cabg: update?.cabg_count ?? 0,
    bronchs: update?.bronch_count ?? 0,
    sputumInductions: update?.sputum_induction_count ?? 0,
    other: update?.other_procedure_count ?? 0,
    note: update?.other_procedure_note ?? null
  };
}

export function procedureTotal(counts: ProcedureCounts) {
  return (
    counts.cSections +
    counts.vaginalDelivery +
    counts.cabg +
    counts.bronchs +
    counts.sputumInductions +
    counts.other
  );
}

export function isFreshProcedureUpdate(update: ShiftStatusUpdate | null, now: Date) {
  if (!update) {
    return false;
  }

  const updatedAt = new Date(update.updated_at).getTime();

  if (!Number.isFinite(updatedAt)) {
    return false;
  }

  return now.getTime() - updatedAt < 24 * 60 * 60 * 1000;
}
