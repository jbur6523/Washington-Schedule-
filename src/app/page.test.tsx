import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { getAuth, redirect } = vi.hoisted(() => ({ getAuth: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getAuthenticatedUserContext: getAuth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ hasSupabaseServerConfig: () => true }));
vi.mock("@/lib/etime/server", () => ({ reviewer: async () => null }));
vi.mock("@/app/app-client", () => ({ default: () => <div>Existing RT Schedule</div> }));
import Home from "./page";
describe("explicit RT schedule window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirect.mockImplementation(() => { throw new Error("redirect"); });
    getAuth.mockResolvedValue({ status: "authenticated", context: { role: "staff", operationsRole: "icu_command_center" } });
  });
  it("preserves the default ICU landing page", async () => {
    await expect(Home()).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith("/icu-command-center");
  });
  it("renders the existing schedule for an authorized ICU user requesting it", async () => {
    render(await Home({ searchParams: Promise.resolve({ view: "schedule" }) }));
    expect(screen.getByText("Existing RT Schedule")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
  it("still requires an authenticated session", async () => {
    getAuth.mockResolvedValue({ status: "unauthenticated" });
    await expect(Home({ searchParams: Promise.resolve({ view: "schedule" }) })).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
