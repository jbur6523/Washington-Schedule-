import { NextResponse } from "next/server";
import { authenticatedLandingPath } from "@/lib/auth/access";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0"
};

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
      redirectTo: authenticatedLandingPath(auth.context)
    },
    { headers: noStoreHeaders }
  );
}
