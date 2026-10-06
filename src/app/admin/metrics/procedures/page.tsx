import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function ProcedureMetricsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const parameters = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["month", "range", "start", "end", "view"]) {
    const value = parameters?.[key];
    if (typeof value === "string") query.set(key, value);
  }
  redirect(`/admin/rvu-staffing-metrics${query.size ? `?${query}` : ""}`);
}
