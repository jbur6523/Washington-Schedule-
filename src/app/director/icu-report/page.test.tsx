import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Page from "./page";

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/current-user", () => ({ getAuthenticatedUserContext: auth }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
  notFound: () => { throw new Error("not-found"); }
}));
vi.mock("@/components/LeadershipIcuReport", () => ({ LeadershipIcuReport: ({ departmentId, departmentName }: { departmentId: string; departmentName: string }) => <div>{departmentId} {departmentName}</div> }));

describe("leadership ICU report access", () => {
  it("uses the authenticated leadership department", async () => {
    auth.mockResolvedValue({ status: "authenticated", context: { role: "staff", operationsRole: "leadership", departmentId: "department-1", departmentName: "Respiratory Therapy" } });
    render(await Page());
    expect(screen.getByText("department-1 Respiratory Therapy")).toBeInTheDocument();
  });
  it("redirects signed-out users to login", async () => {
    auth.mockResolvedValue({ status: "unauthenticated" });
    await expect(Page()).rejects.toThrow("redirect:/login");
  });
  it("denies users without dashboard access", async () => {
    auth.mockResolvedValue({ status: "authenticated", context: { role: "staff", operationsRole: "none" } });
    await expect(Page()).rejects.toThrow("not-found");
  });
});
