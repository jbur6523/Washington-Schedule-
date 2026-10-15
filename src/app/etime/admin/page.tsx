import { redirect } from "next/navigation";
import { reviewer } from "@/lib/etime/server";
import { EtimeClient } from "@/components/etime/EtimeClient";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const grant = await reviewer();
  if (grant?.role !== "identity_admin") redirect("/login");
  return <EtimeClient mode="admin" />;
}
