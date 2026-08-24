import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthVerificationNotice } from "@/components/AuthVerificationNotice";
import { ShiftUpdateClient } from "@/components/ShiftUpdateClient";
import { ShiftUpdateSelection } from "@/components/ShiftUpdateSelection";
import { canManageShiftStatus } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { shiftUpdateSelectionsForInstant } from "@/lib/shift-status/reporting-window";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function AccessDenied() {
  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">Shift Update</p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">You do not have access to this page.</h1>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700"
        >
          Back to Schedule
        </Link>
      </section>
    </main>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export default async function CommandCenterShiftUpdatePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }


  if (auth.status === "error") {
    return <AuthVerificationNotice message={auth.message} />;
  }

  if (auth.status !== "authenticated" || !canManageShiftStatus(auth.context)) {
    return <AccessDenied />;
  }

  const params = (await searchParams) ?? {};
  const shiftDate = validDate(firstParam(params.date));
  const requestedShift = firstParam(params.shift);
  const shiftType = requestedShift === "day" || requestedShift === "night" ? requestedShift : null;

  if (!shiftDate || !shiftType) {
    return <ShiftUpdateSelection options={shiftUpdateSelectionsForInstant(new Date())} />;
  }

  const supabase = await createClient();
  const { data: department } = await supabase
    .from("departments")
    .select("timezone")
    .eq("id", auth.context.departmentId)
    .maybeSingle();
  const timezone = (department?.timezone as string | null | undefined) || "America/Los_Angeles";

  return (
    <ShiftUpdateClient
      authContext={auth.context}
      timezone={timezone}
      selection={{ shiftDate, shiftType }}
    />
  );
}
