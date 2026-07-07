import { NextResponse } from "next/server";
import { getAuthenticatedUserContext } from "@/lib/auth/current-user";

export async function GET() {
  const auth = await getAuthenticatedUserContext();

  if (auth.status === "inactive") {
    return NextResponse.json(
      {
        status: "inactive",
        message: "This account is inactive. Please contact an administrator."
      },
      { status: 403 }
    );
  }

  if (auth.status !== "authenticated") {
    return NextResponse.json({ status: auth.status }, { status: 401 });
  }

  return NextResponse.json({ status: "active" });
}
