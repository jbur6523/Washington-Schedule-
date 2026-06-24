import { NextResponse } from "next/server";
import { getPublicVapidKey } from "@/lib/notifications/web-push";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ publicKey: getPublicVapidKey() });
}
