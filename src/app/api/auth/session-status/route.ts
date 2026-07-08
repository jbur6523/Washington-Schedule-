import { NextResponse } from "next/server";
import { isCommandCenter, isDirector, isIcuCommandCenter } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0"
};

function appLandingPath(context: AuthenticatedUserContext) {
  if (isCommandCenter(context)) {
    return "/command-center";
  }

  if (isIcuCommandCenter(context)) {
    return "/icu-command-center";
  }

  if (isDirector(context)) {
    return "/director/shift-status";
  }

  return "/";
}

export async function GET() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "error") {
    return NextResponse.json(
      {
        status: "checking",
        message: auth.message ?? "Could not verify access. Please refresh or try again."
      },
      { status: 503, headers: noStoreHeaders }
    );
  }

  if (auth.status !== "authenticated") {
    return NextResponse.json({ status: auth.status }, { status: 401, headers: noStoreHeaders });
  }

  return NextResponse.json(
    {
      status: "active",
      role: auth.context.role,
      operationsRole: auth.context.operationsRole,
      redirectTo: appLandingPath(auth.context)
    },
    { headers: noStoreHeaders }
  );
}
