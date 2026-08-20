export const SUPABASE_PAGE_SIZE = 500;

type PageError = { message: string };
type PageResult<Row> = { data: Row[] | null; error: PageError | null };

/** Fetches every row without relying on the project's PostgREST response cap. */
export async function fetchAllPages<Row>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<Row>>,
  pageSize = SUPABASE_PAGE_SIZE
) {
  const rows: Row[] = [];

  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);

    if (result.error) {
      return { data: null, error: result.error };
    }

    const page = result.data ?? [];
    rows.push(...page);

    if (page.length < pageSize) {
      return { data: rows, error: null };
    }
  }
}
