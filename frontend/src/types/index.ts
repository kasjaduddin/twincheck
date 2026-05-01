// ─── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = "adjuster" | "hq";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  expires_at: string;
}

// ─── Claims ──────────────────────────────────────────────────────────────────

export type ClaimStatus =
  | "unassigned"
  | "assigned"
  | "on_site"
  | "completed"
  | "ready_for_review"
  | "reconstruction_failed"
  | "under_review"
  | "approved"
  | "escalated"
  | "rejected";

export interface ClaimAssignedTo {
  id: string;
  name: string;
}

export interface ClaimPolicy {
  id?: string;
  policy_number?: string;
  holder_name: string;
  equipment_type: string;
  insured_value: number;
  coverage_start?: string;
  coverage_end?: string;
  incident_type?: string;
}

export interface Claim {
  id: string;
  status: ClaimStatus;
  site_address: string;
  site_contact: string;
  claimed_amount: number;
  assigned_to: ClaimAssignedTo | null;
  policy: ClaimPolicy;
  equipment: Equipment | null;
  created_at: string;
  updated_at: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ClaimsListResponse {
  claims: Claim[];
  pagination: PaginationMeta;
}

// ─── Equipment ───────────────────────────────────────────────────────────────

export type CadMatchStatus = "full" | "partial" | "not_available";

export interface Equipment {
  id: string;
  claim_id: string;
  equipment_id_qr: string;
  manufacturer: string;
  model: string;
  year: number | null;
  cad_ref_url: string | null;
  cad_match_status: CadMatchStatus;
  created_at: string;
}

// ─── Report ──────────────────────────────────────────────────────────────────

export interface Report {
  id: string;
  claim_id: string;
  section_a: Record<string, unknown> | null;
  section_b: Record<string, unknown> | null;
  section_c: Record<string, unknown> | null;
  section_d: Record<string, unknown> | null;
  section_e: Record<string, unknown> | null;
  section_f: Record<string, unknown> | null;
  section_g: Record<string, unknown> | null;
  submitted_at: string | null;
  updated_at: string;
}

// ─── Evidence ────────────────────────────────────────────────────────────────

export type EvidenceType = "audio" | "video" | "point_cloud" | "splat";

export interface Evidence {
  id: string;
  claim_id?: string;
  type: EvidenceType | string;
  storage_url: string;
  gps_lat?: number;
  gps_lng?: number;
  captured_at: string;
  created_at?: string;
}

// ─── Damage Findings ─────────────────────────────────────────────────────────

export type DamageSeverity = "red" | "amber" | "green";

export interface DamageFinding {
  id: string;
  component_id: string;
  component_type: string;
  deviation_type: string | null;
  measurement: number | null;
  severity: DamageSeverity;
  spatial_position: { x: number; y: number; z: number } | null;
  covered: boolean | null;
  policy_clause: string | null;
}

// ─── GS Job ──────────────────────────────────────────────────────────────────

export type GsJobStatus = "pending" | "processing" | "completed" | "failed";

export interface GsJob {
  id: string;
  claim_id: string;
  status: GsJobStatus;
  splat_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

// ─── Adjuster (HQ view) ──────────────────────────────────────────────────────

export interface AdjusterSummary {
  id: string;
  name: string;
  email: string;
  active_claims_count: number;
}

// ─── MR App — UC-02 Interview Checklist ──────────────────────────────────────

// Keys match what the WebSocket broadcasts from the backend STT processor.
export interface ChecklistState {
  incident_when: boolean;
  first_discovered: boolean;
  equipment_condition: boolean;
  scheduled_maintenance: boolean;
  last_known_service: boolean;
  other_witnesses: boolean;
}

export const DEFAULT_CHECKLIST: ChecklistState = {
  incident_when: false,
  first_discovered: false,
  equipment_condition: false,
  scheduled_maintenance: false,
  last_known_service: false,
  other_witnesses: false,
};