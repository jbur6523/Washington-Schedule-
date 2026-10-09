import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextResult } from "@/lib/auth/types";

const { getAuth, redirect } = vi.hoisted(() => ({ getAuth: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getAuthenticatedUserContext: getAuth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/IcuCommandCenterClient", () => ({
  IcuCommandCenterClient: ({ authContext }: { authContext: { displayName: string } }) => <div>ICU session: {authContext.displayName}</div>
}));
import IcuPage from "./page";

describe("ICU uses the existing Schedule session", () => {
  beforeEach(() => { vi.clearAllMocks(); redirect.mockImplementation(() => { throw new Error("redirect"); }); });
  it("opens the existing ICU client for authenticated regular staff", async () => {
    getAuth.mockResolvedValue({ status: "authenticated", context: { role: "staff", operationsRole: "none", displayName: "Schedule employee" } } as AuthContextResult);
    render(await IcuPage());
    expect(screen.getByText("ICU session: Schedule employee")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
  it.each(["inactive", "unassigned"])("denies %s accounts", async status => {
    getAuth.mockResolvedValue({ status });
    render(await IcuPage());
    expect(screen.getByText("You do not have access to this page.")).toBeInTheDocument();
    expect(screen.queryByText(/ICU session:/)).not.toBeInTheDocument();
  });
  it.each(["staff", "lead", "admin"])("blocks direct URL access for Aides with %s membership", async role => {
    getAuth.mockResolvedValue({ status: "authenticated", context: { role, operationsRole: "aide", displayName: "Aide" } });
    render(await IcuPage());
    expect(screen.getByText("You do not have access to this page.")).toBeInTheDocument();
    expect(screen.queryByText(/ICU session:/)).not.toBeInTheDocument();
  });
  it("requires sign-in when the session is missing or expired", async () => {
    getAuth.mockResolvedValue({ status: "unauthenticated" });
    await expect(IcuPage()).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
