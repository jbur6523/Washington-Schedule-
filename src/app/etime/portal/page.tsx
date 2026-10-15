import { redirect } from "next/navigation";
import { reviewer } from "@/lib/etime/server";
import { payrollReviewRole } from "@/lib/etime/access";
import { EtimeClient } from "@/components/etime/EtimeClient";
export const dynamic = "force-dynamic";
export default async function PortalPage() {
  const grant = await reviewer();
  if (!payrollReviewRole(grant)) redirect("/login");
  return <EtimeClient mode="review" />;
}
