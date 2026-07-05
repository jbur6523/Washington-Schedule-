import { redirect } from "next/navigation";
import AppClient from "@/app/app-client";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { isCommandCenter, isDirector } from "@/lib/auth/access";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const fallbackDevelopmentContext: AuthenticatedUserContext = {
  authUserId: "local-development",
  profileId: "local-development",
  staffProfileId: "local-development",
  departmentId: "local-development",
  departmentName: "Respiratory Department",
  role: "admin",
  operationsRole: "none",
  displayName: "Local Development",
  hasLinkedStaffProfile: true
};

function ConfigurationRequired() {
  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-soft">
        <h1 className="text-2xl font-black text-amber-950">Supabase configuration required</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-amber-900">
          Authentication is required in production. Add NEXT_PUBLIC_SUPABASE_URL and
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then redeploy. Username claim/reset also needs
          the server-only SUPABASE_SECRET_KEY.
        </p>
      </section>
    </main>
  );
}

function UnassignedAccount({ displayName }: { displayName?: string }) {
  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">
          WHHS RT Schedule
        </p>
        <h1 className="mt-2 text-2xl font-black text-hospital-ink">
          Department assignment needed
        </h1>
        {displayName && (
          <p className="mt-2 text-sm font-bold text-slate-500">
            Signed in as {displayName}
          </p>
        )}
        <p className="mt-4 text-sm font-bold leading-6 text-slate-600">
          Your account has not been assigned to a department. Please contact the schedule administrator.
        </p>
      </section>
    </main>
  );
}

export default async function Home() {
  if (!hasSupabaseServerConfig()) {
    if (process.env.NODE_ENV === "production") {
      return <ConfigurationRequired />;
    }

    return <AppClient authContext={fallbackDevelopmentContext} developmentFallback />;
  }

  const auth = await getAuthenticatedUserContext();

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  if (auth.status === "unassigned") {
    return <UnassignedAccount displayName={auth.displayName} />;
  }

  if (isCommandCenter(auth.context)) {
    redirect("/command-center");
  }

  if (isDirector(auth.context)) {
    redirect("/director/shift-status");
  }

  return <AppClient authContext={auth.context} />;
}
