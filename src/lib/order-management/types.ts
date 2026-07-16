export type PmmCatalogStatus = "active" | "discontinued" | "do_not_use";

export type PmmCatalogRow = {
  pmm_number: string;
  item_name: string;
  catalog_status: PmmCatalogStatus;
  is_orderable: boolean;
  review_required: boolean;
};
export type PmmLookupState = {
  pmmNumber: string;
  itemName: string | null;
  state: "loading" | "active" | "review" | "blocked" | "unknown" | "error";
  catalogStatus: PmmCatalogStatus | null;
};

export type NonCatalogDraft = {
  id: string;
  itemName: string;
};

export type OrderLinesDraft = {
  pmmNumbers: string[];
  duplicatePmmNumbers: string[];
  invalidTokens: string[];
  lookupStates: PmmLookupState[];
  lookupLoading: boolean;
  lookupError: string;
  nonCatalogItems: NonCatalogDraft[];
};

export type DepartmentOrderLine = {
  id: string;
  order_id: string;
  line_type: "pmm" | "non_catalog";
  pmm_number: string | null;
  item_name_snapshot: string;
  sort_order: number;
  created_at: string;
};

export type DepartmentOrderRow = {
  id: string;
  department_id: string;
  created_by_staff_profile_id: string | null;
  created_by_name: string | null;
  req_number: string | null;
  image_url: string | null;
  image_storage_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  department_order_lines?: DepartmentOrderLine[] | null;
};

export type OrderWithPreview = DepartmentOrderRow & {
  signedImageUrl: string | null;
};

export type OrderLineRpcInput =
  | { line_type: "pmm"; pmm_number: string }
  | { line_type: "non_catalog"; item_name: string };

export const emptyOrderLinesDraft: OrderLinesDraft = {
  pmmNumbers: [],
  duplicatePmmNumbers: [],
  invalidTokens: [],
  lookupStates: [],
  lookupLoading: false,
  lookupError: "",
  nonCatalogItems: []
};
