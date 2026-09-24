import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAndSignOut } from "@/lib/auth/client-session";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn()
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signOut: mocks.signOut }
  })
}));

describe("client session sign out", () => {
  beforeEach(() => {
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue({ error: null });
    window.sessionStorage.setItem("test-session-value", "present");
  });

  it("ends only the current session and preserves sessions on other devices", async () => {
    await clearAndSignOut();

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(window.sessionStorage.getItem("test-session-value")).toBeNull();
  });
});
