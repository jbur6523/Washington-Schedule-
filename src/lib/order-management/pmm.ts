import type {
  NonCatalogDraft,
  OrderLineRpcInput,
  PmmCatalogRow,
  PmmLookupState
} from "@/lib/order-management/types";

export type ParsedPmmInput = {
  pmmNumbers: string[];
  duplicatePmmNumbers: string[];
  invalidTokens: string[];
};

export function parsePmmInput(value: string): ParsedPmmInput {
  const tokens = value.split(/[,;\s]+/).map((token) => token.trim()).filter(Boolean);
  const seenPmmNumbers = new Set<string>();
  const seenDuplicates = new Set<string>();
  const seenInvalid = new Set<string>();
  const pmmNumbers: string[] = [];
  const duplicatePmmNumbers: string[] = [];
  const invalidTokens: string[] = [];

  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      if (!seenInvalid.has(token)) {
        seenInvalid.add(token);
        invalidTokens.push(token);
      }
      continue;
    }

    if (seenPmmNumbers.has(token)) {
      if (!seenDuplicates.has(token)) {
        seenDuplicates.add(token);
        duplicatePmmNumbers.push(token);
      }
      continue;
    }

    seenPmmNumbers.add(token);
    pmmNumbers.push(token);
  }

  return { pmmNumbers, duplicatePmmNumbers, invalidTokens };
}

export function formatPmmNumbers(pmmNumbers: string[]) {
  return pmmNumbers.join(", ");
}

export function normalizePmmInput(value: string) {
  return formatPmmNumbers(parsePmmInput(value).pmmNumbers);
}

export function applySpaceDelimiter(value: string, selectionStart: number, selectionEnd: number) {
  const before = value.slice(0, selectionStart).replace(/\s+$/, "");
  const after = value.slice(selectionEnd).replace(/^[,;\s]+/, "");

  if (!before || /[,;]$/.test(before)) {
    const normalizedBefore = before.replace(/;$/, ",");
    const nextValue = normalizedBefore ? `${normalizedBefore} ${after}` : after;
    return { value: nextValue, caret: normalizedBefore ? normalizedBefore.length + 1 : 0 };
  }

  const prefix = `${before}, `;
  return { value: `${prefix}${after}`, caret: prefix.length };
}

export function buildPmmLookupStates(
  pmmNumbers: string[],
  rows: PmmCatalogRow[],
  status: "loading" | "ready" | "error"
): PmmLookupState[] {
  const rowsByPmm = new Map(rows.map((row) => [row.pmm_number, row]));

  return pmmNumbers.map((pmmNumber) => {
    if (status === "loading") {
      return { pmmNumber, itemName: null, state: "loading", catalogStatus: null };
    }

    if (status === "error") {
      return { pmmNumber, itemName: null, state: "error", catalogStatus: null };
    }

    const row = rowsByPmm.get(pmmNumber);
    if (!row) {
      return { pmmNumber, itemName: null, state: "unknown", catalogStatus: null };
    }

    if (row.catalog_status !== "active" || !row.is_orderable) {
      return {
        pmmNumber,
        itemName: row.item_name,
        state: "blocked",
        catalogStatus: row.catalog_status
      };
    }

    return {
      pmmNumber,
      itemName: row.item_name,
      state: row.review_required ? "review" : "active",
      catalogStatus: row.catalog_status
    };
  });
}

export function validateNonCatalogItems(items: NonCatalogDraft[]) {
  return items.filter((item) => !item.itemName.trim() || item.itemName.trim().length > 500).map((item) => item.id);
}

export function buildOrderLineRpcInputs(pmmNumbers: string[], nonCatalogItems: NonCatalogDraft[]): OrderLineRpcInput[] {
  return [
    ...pmmNumbers.map((pmmNumber) => ({ line_type: "pmm" as const, pmm_number: pmmNumber })),
    ...nonCatalogItems.map((item) => ({ line_type: "non_catalog" as const, item_name: item.itemName.trim() }))
  ];
}

export function mapOrderRpcError(message: string) {
  const pmmMatch = message.match(/(?:UNKNOWN_PMM|PMM_NOT_ORDERABLE|INVALID_PMM_NUMBER|DUPLICATE_PMM):([^\s"]+)/);
  const pmmNumber = pmmMatch?.[1] ?? "";

  if (message.includes("UNKNOWN_PMM")) return `PMM #${pmmNumber} was not found.`;
  if (message.includes("PMM_NOT_ORDERABLE")) return `PMM #${pmmNumber} cannot be ordered.`;
  if (message.includes("DUPLICATE_PMM")) return `PMM #${pmmNumber} was entered more than once.`;
  if (message.includes("INVALID_PMM_NUMBER")) return `PMM #${pmmNumber} is not valid.`;
  if (message.includes("INVALID_NON_CATALOG_ITEM")) return "Every Non-Catalog Item needs a valid item name.";
  if (message.includes("ORDER_CONTENT_REQUIRED")) return "Add a PMM, Non-Catalog Item, picture, note, or Req Number.";
  if (message.includes("ORDER_ID_REPLAY_MISMATCH")) {
    return "This submission ID was already used for different order details. Refresh Order History before trying again.";
  }
  if (message.includes("ORDER_ACCESS_DENIED") || message.includes("INVALID_ORDER_ACTOR")) {
    return "Your account is not authorized to create this order.";
  }

  return "Unable to create order.";
}

export function isExplicitOrderRpcRejection(message: string) {
  return [
    "UNKNOWN_PMM",
    "PMM_NOT_ORDERABLE",
    "INVALID_PMM_NUMBER",
    "DUPLICATE_PMM",
    "INVALID_NON_CATALOG_ITEM",
    "INVALID_ORDER_LINE_TYPE",
    "ORDER_CONTENT_REQUIRED",
    "ORDER_ID_REPLAY_MISMATCH",
    "ORDER_ACCESS_DENIED",
    "INVALID_ORDER_ACTOR",
    "INVALID_REQ_NUMBER",
    "INVALID_ORDER_NOTES",
    "INVALID_ORDER_IMAGE_PATH"
  ].some((code) => message.includes(code));
}

export type OrderRpcErrorDetails = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function getOrderRpcDiagnosticCode(error: OrderRpcErrorDetails) {
  const normalizedCode = (error.code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);

  return `OM-RPC-${normalizedCode || "UNEXPECTED"}`;
}

export function mapUnexpectedOrderRpcError(error: OrderRpcErrorDetails) {
  const diagnosticCode = getOrderRpcDiagnosticCode(error);

  if (error.code === "42883") {
    return `The order service needs a database repair. Report code ${diagnosticCode}. Retry this order after the repair is applied.`;
  }

  if (error.code === "PGRST202") {
    return `The order service is still updating. Report code ${diagnosticCode}. Try again shortly with the same order.`;
  }

  if (error.code === "42501") {
    return `The order service denied the request. Report code ${diagnosticCode}.`;
  }

  return `Could not confirm whether the order was saved. Report code ${diagnosticCode}. Tap Submit Order again to retry safely with the same order ID.`;
}
