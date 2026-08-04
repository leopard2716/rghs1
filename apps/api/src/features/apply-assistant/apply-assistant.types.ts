import type {
  ApplySessionResponse,
  ExtractedJob,
  FieldMap,
  GeneratedResume,
  PageSnapshot
} from "./apply-assistant.schemas";

export type ExtensionConnectionCodeRow = {
  id: string;
  workspace_id: string;
  member_id: string;
  code_hash: string;
  scopes: string[];
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

export type ExtensionTokenRow = {
  id: string;
  workspace_id: string;
  member_id: string;
  default_profile_id: string | null;
  default_job_market_id: string | null;
  token_hash: string;
  scopes: string[];
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type ApplyAssistantSessionRow = {
  id: string;
  workspace_id: string;
  member_id: string;
  profile_id: string | null;
  job_market_id: string | null;
  page_url: string;
  page_origin: string;
  page_title: string;
  page_snapshot: PageSnapshot | null;
  step_snapshots?: PageSnapshot[];
  extracted_job: ExtractedJob | null;
  field_map: FieldMap | null;
  resume_versions: GeneratedResume[];
  status: ApplySessionResponse["status"];
  created_at: string;
  updated_at: string;
};

export const extensionConnectionCodeFields =
  "id,workspace_id,member_id,code_hash,scopes,expires_at,consumed_at,created_at";

export const extensionTokenFields =
  "id,workspace_id,member_id,default_profile_id,default_job_market_id,token_hash,scopes,expires_at,last_used_at,revoked_at,created_at";

export const applyAssistantSessionFields =
  "id,workspace_id,member_id,profile_id,job_market_id,page_url,page_origin,page_title,page_snapshot,step_snapshots,extracted_job,field_map,resume_versions,status,created_at,updated_at";
