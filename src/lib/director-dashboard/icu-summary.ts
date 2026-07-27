import type { IcuSnapshotCounts } from "@/lib/icu-command-center/types";

export type DirectorDashboardIcuSummaryModel = {
  vents: number | null;
  hfnc: number;
  bipap: number;
  criticalVents: number;
};

export function composeDirectorDashboardIcuSummary({
  officialVentCount,
  rawIcuCounts
}: {
  officialVentCount: number | null;
  rawIcuCounts: IcuSnapshotCounts;
}): DirectorDashboardIcuSummaryModel {
  return {
    vents: officialVentCount,
    hfnc: rawIcuCounts.hfnc,
    bipap: rawIcuCounts.bipap,
    criticalVents: rawIcuCounts.criticalVents
  };
}
