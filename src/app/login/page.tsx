import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { LoginForm } from "@/app/login/login-form";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function LoginConfigurationMessage() {
  return (
    <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-900">
      Supabase environment variables are not configured. Local development can use the demo fallback at the app home page.
    </p>
  );
}

export default async function LoginPage() {
  if (hasSupabaseServerConfig()) {
    const auth = await getAuthenticatedUserContext();

    if (auth.status === "authenticated" || auth.status === "unassigned") {
      redirect("/");
    }
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-xl rounded-3xl border border-white bg-white/95 p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-black text-hospital-ink">Washington Schedule</h1>
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-extrabold text-cyan-700">
            <Sparkles size={13} />
            Pilot
          </span>
        </div>
        <p className="mt-2 text-sm font-bold text-hospital-muted">
          Respiratory Department
        </p>
        {hasSupabaseServerConfig() ? <LoginForm /> : <LoginConfigurationMessage />}
      </section>
    </main>
  );
}
