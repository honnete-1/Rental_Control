export type Role = "landlord" | "manager" | "tenant" | "admin";

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  role: Role;
  language: "en" | "rw" | "fr";
  text_size: "normal" | "large";
  onboarding_completed: boolean;
  unread_notifications: number;
  has_home: boolean;
  is_demo: boolean;
}

export interface Property {
  id: number;
  name: string;
  property_type: string;
  address: string;
  district: string;
  city: string;
  description: string;
  notes: string;
  photo: string | null;
  unit_count: number;
  occupied_count: number;
  open_requests: number;
  urgent_requests: number;
  owner_name: string;
  is_owner: boolean;
  created_at: string;
  is_demo: boolean;
}

export interface Person {
  id: number;
  full_name: string;
  email: string;
  phone: string;
}

export interface Tenancy {
  id: number;
  unit: number;
  unit_name: string;
  property_id: number;
  property_name: string;
  tenant: Person;
  start_date: string;
  lease_end_date: string | null;
  moved_out_on: string | null;
  monthly_rent: number;
  rent_due_day: number;
  share_payments_with_tenant: boolean;
  is_active: boolean;
}

export interface Invitation {
  id: number;
  unit: number;
  unit_name: string;
  property_name: string;
  full_name: string;
  email: string;
  phone: string;
  start_date: string;
  monthly_rent: number;
  status: "pending" | "accepted" | "expired" | "cancelled";
  expires_at: string;
  invite_link?: string;
}

export type Condition = "good" | "needs_attention" | "damaged" | "not_checked";

export interface Unit {
  id: number;
  property: number;
  property_name: string;
  name: string;
  unit_type: string;
  bedrooms: number | null;
  bathrooms: number | null;
  monthly_rent: number | null;
  notes: string;
  occupancy: "occupied" | "vacant" | "invited";
  current_tenancy: Tenancy | null;
  pending_invitation: Invitation | null;
  open_requests: number;
  latest_condition: { inspection_id: number; inspection_date: string; overall: Condition; counts: Record<Condition, number> } | null;
}

export type RequestStatus = "new" | "under_review" | "approved" | "in_progress" | "resolved" | "closed";
export type Priority = "low" | "normal" | "urgent";

export interface MaintenanceRequest {
  id: number;
  reference: string;
  unit: number;
  unit_name: string;
  property_id: number;
  property_name: string;
  reported_by_name: string;
  reported_by_role: Role;
  category: string;
  location_in_home: string;
  description: string;
  priority: Priority;
  status: RequestStatus;
  provider_name: string;
  provider_phone: string;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_notes: string;
  photo_count: number;
  first_photo: string | null;
  allowed_transitions: RequestStatus[];
  created_at: string;
  updated_at: string;
}

export interface MaintenanceUpdate {
  id: number;
  kind: string;
  from_status: string;
  to_status: string;
  message: string;
  visible_to_tenant: boolean;
  author_name: string | null;
  author_role: Role | null;
  created_at: string;
}

export interface Repair {
  id: number;
  unit: number;
  unit_name: string;
  property_id: number;
  property_name: string;
  request: number | null;
  request_reference: string | null;
  description: string;
  provider_name: string;
  provider_phone?: string;
  completed_on: string;
  cost?: number;
  notes?: string;
  expense_id?: number | null;
}

export interface MaintenanceDetail extends MaintenanceRequest {
  photos: { id: number; image: string; phase: string; caption: string; created_at: string }[];
  updates: MaintenanceUpdate[];
  repair: Repair | null;
  reported_by_phone: string | null;
}

export interface InspectionItem {
  id: number;
  area: string;
  element: string;
  condition: Condition;
  notes: string;
  position: number;
}

export interface Inspection {
  id: number;
  unit: number;
  unit_name: string;
  property_id: number;
  property_name: string;
  inspection_type: "move_in" | "periodic" | "move_out";
  inspection_date: string;
  inspector_name: string;
  status: "draft" | "completed";
  summary: string;
  shared_with_tenant: boolean;
  counts: Record<Condition, number>;
  photo_count: number;
  completed_at: string | null;
  items?: InspectionItem[];
  photos?: { id: number; area: string; image: string; caption: string; created_at: string }[];
}

export interface PassportPhoto {
  id: string;
  url: string;
  date: string;
  source: "inspection" | "maintenance";
  source_id: number;
  inspection_type?: string;
  phase?: string;
  area: string;
  caption: string;
  reference?: string;
}

export interface Passport {
  unit: { id: number; name: string; unit_type: string; bedrooms: number | null; bathrooms: number | null; property_id: number; property_name: string; property_photo: string | null; monthly_rent: number | null };
  current_tenant: { id: number; full_name: string; since: string } | null;
  latest_condition: {
    inspection_id: number;
    inspection_date: string;
    inspection_type: string;
    summary: string;
    rooms: { area: string; condition: Condition; items: { element: string; condition: Condition; notes: string }[] }[];
  } | null;
  inspections: { id: number; inspection_type: string; inspection_date: string; inspector_name: string; status: string; photo_count: number; problem_count: number }[];
  maintenance: { id: number; reference: string; category: string; description: string; status: RequestStatus; priority: Priority; created_at: string; resolved_at: string | null }[];
  repairs: { id: number; description: string; provider_name: string; completed_on: string; cost: number | null; request_id: number | null; request_reference: string | null }[];
  photos: PassportPhoto[];
  totals: { open_requests: number; completed_repairs: number; repair_cost: number | null; inspections: number };
}

export interface Expense {
  id: number;
  property: number;
  property_name: string;
  unit: number | null;
  unit_name: string | null;
  category: string;
  amount: number;
  currency: string;
  spent_on: string;
  description: string;
  maintenance_request: number | null;
  maintenance_reference: string | null;
  is_repair_cost: boolean;
  receipt: string | null;
}

export interface Notification {
  id: number;
  kind: string;
  params: Record<string, string | number>;
  link: string;
  is_read: boolean;
  created_at: string;
}

export interface RentRow {
  tenancy_id: number;
  tenant_name: string;
  tenant_phone: string;
  unit_id: number;
  unit_name: string;
  property_id: number;
  property_name: string;
  monthly_rent: number;
  rent_due_day: number;
  is_active: boolean;
  total_due_to_date: number;
  total_paid: number;
  outstanding: number;
  overdue_count: number;
  next_due: RentCharge | null;
}

export interface RentCharge {
  id: number;
  period_start: string;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  balance: number;
  status: "paid" | "overdue" | "partly_paid" | "due" | "upcoming";
}

export interface RentPayment {
  id: number;
  tenancy: number;
  tenant_name: string;
  unit_name: string;
  property_name: string;
  amount: number;
  paid_on: string;
  method: string;
  reference: string;
  notes: string;
}

export interface FinanceSummary {
  date_from: string;
  date_to: string;
  rent_due: number;
  rent_received: number;
  outstanding: number;
  maintenance_expenses: number;
  other_expenses: number;
  total_expenses: number;
  net_cash_flow: number;
  expenses_by_category: Record<string, number>;
  occupancy: { units: number; occupied: number; vacant: number };
  per_property: { property_id: number; property_name: string; rent_due: number; rent_received: number; expenses: number; net_cash_flow: number }[];
  months: { month: string; rent_received: number; expenses: number }[];
}
