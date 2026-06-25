/**
 * Phase 17B — Bridge between the import layer's CanonicalField space and the
 * Data Source Reliability Framework field registry.
 *
 * Used by manager-facing surfaces (import review, LLS, reports) to surface
 * a "Measured / Derived / Estimated / Contextual / Untrusted" badge next to
 * the fields they expose.
 */
import type { CanonicalField } from "@/lib/import/column-intelligence";

/**
 * Maps a column-intelligence canonical field to a key in FIELD_REGISTRY.
 * Falls back to "unknown" → the registry treats unknowns as untrusted.
 */
export const CANONICAL_TO_RELIABILITY: Partial<Record<CanonicalField, string>> = {
  // Identity
  employee_id: "pos_server_id",
  server_name: "duplicate_name_no_identity", // name alone is untrusted unless identity confirmed
  job_role: "rota_scheduled_role",

  // Time
  shift_date: "pos_check_timestamp",
  shift_start_time: "labour_clock_in",
  shift_end_time: "labour_clock_out",
  check_open_time: "pos_check_timestamp",
  check_close_time: "pos_check_timestamp",

  // Sales (measured)
  gross_sales: "pos_check_total",
  net_sales: "pos_check_total",
  food_sales: "pos_check_total",
  beverage_sales: "pos_check_total",
  payment_total: "pos_check_total",

  // Volume
  covers_served: "pos_check_total", // measured at POS when present
  checks: "pos_check_total",
  items_sold: "pos_item_quantity",

  // Labour
  hours_worked: "labour_paid_hours",
  scheduled_hours: "rota_scheduled_shift",
  hourly_rate: "labour_wage_cost_known_basis",
  labor_cost: "labour_wage_cost_known_basis",
  fully_loaded_labor_cost: "labour_wage_cost_known_basis",

  // Adjustments — measured POS facts
  discount: "pos_check_total",
  comp: "pos_check_total",
  void: "pos_check_total",
  refund: "pos_check_total",

  // Tips / service / tax — measured
  tips: "pos_check_total",
  service_charge: "pos_check_total",
  tax: "pos_check_total",
  vat: "pos_check_total",

  // Menu
  menu_item: "pos_item_sold",
  item_id: "pos_item_sold",
  category: "pos_menu_category",
  major_group: "pos_menu_category",
  quantity: "pos_item_quantity",
  unit_price: "pos_item_price",
  item_revenue: "pos_check_total",
  check_id: "pos_check_total",
  payment_method: "pos_payment_status",
};

/**
 * Returns the reliability registry key for a CanonicalField, or "unknown".
 */
export function reliabilityKeyForCanonical(field: CanonicalField): string {
  return CANONICAL_TO_RELIABILITY[field] ?? "unknown";
}
