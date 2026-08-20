import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "@/lib/supabase/paginated-query";

describe("fetchAllPages", () => {
  it.each([1000, 1238, 2507])("returns every row from a %s-row result", async (count) => {
    const source = Array.from({ length: count }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1),
      error: null
    }));
    const result = await fetchAllPages(fetchPage, 500);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(count);
    expect(result.data?.at(-1)).toEqual({ id: count - 1 });
    expect(fetchPage).toHaveBeenCalledTimes(Math.floor(count / 500) + 1);
  });

  it("stops and returns a page error without presenting partial rows", async () => {
    const result = await fetchAllPages(async (from) => from === 0
      ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }
      : { data: null, error: { message: "page failed" } });
    expect(result).toEqual({ data: null, error: { message: "page failed" } });
  });
});
