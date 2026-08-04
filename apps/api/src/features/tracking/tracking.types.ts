import type { RichTextDocument } from "@rghs1/domain";

export type TrackingProfileRow = {
  id: string;
  workspace_id: string;
  name: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  gender?: "man" | "woman" | null;
  date_of_birth?: string | null;
  email?: string | null;
  phone_number?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  linkedin_url?: string | null;
  education_university?: string | null;
  education_location?: string | null;
  education_degree?: string | null;
  education_major?: string | null;
  education_date_from?: string | null;
  education_date_to?: string | null;
  career_experiences?: unknown;
  resume_html_template?: string | null;
  resume_tailoring_note?: string | null;
  created_by_member_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TrackingProfileRequestRow = {
  id: string;
  workspace_id: string;
  name: string;
  requested_by_member_id: string;
  status: "pending" | "approved" | "denied";
  reviewed_by_member_id: string | null;
  resolved_profile_id: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

export type TrackingJobMarketRow = {
  id: string;
  workspace_id: string;
  market_key: string | null;
  name: string;
  system: boolean;
  created_by_member_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type BidRecordRow = {
  id: string;
  workspace_id: string;
  job_market_id: string;
  job_title: string;
  company: string;
  job_link: string;
  bid_at: string;
  job_description: RichTextDocument | string | null;
  application_metadata?: Record<string, unknown> | null;
  created_by_member_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type BidRecordProfileRow = {
  workspace_id: string;
  bid_id: string;
  profile_id: string;
  resume: string | null;
  resume_html?: string | null;
  created_at: string;
};

export type InterviewRecordRow = {
  id: string;
  workspace_id: string;
  bid_id: string;
  profile_id: string;
  step: string;
  start_at: string;
  end_at: string;
  time_zone: string;
  interview_link: string;
  notes: string | null;
  created_by_member_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type JobRecordRow = {
  id: string;
  workspace_id: string;
  bid_id: string;
  bidder_member_id: string;
  caller_member_id: string;
  worker_member_id: string;
  payment_handler_member_id: string;
  bidder_rate: number | string;
  caller_rate: number | string;
  worker_rate: number | string;
  discount_rate: number | string;
  created_by_member_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PaymentRecordRow = {
  id: string;
  workspace_id: string;
  job_record_id: string;
  payment_amount: number | string;
  bidder_member_id: string;
  caller_member_id: string;
  worker_member_id: string;
  payment_manager_member_id: string;
  bidder_amount: number | string;
  caller_amount: number | string;
  worker_amount: number | string;
  payment_manager_amount: number | string;
  status: "pending" | "paid";
  created_by_member_id: string | null;
  paid_by_member_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CustomPaymentRecordRow = {
  id: string;
  workspace_id: string;
  member_id: string;
  name: string;
  amount: number | string;
  direction: "income" | "outcome";
  created_by_member_id: string | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export const trackingProfileFields =
  "id,workspace_id,name,first_name,middle_name,last_name,gender,date_of_birth,email,phone_number,street,city,state,country,postal_code,linkedin_url,education_university,education_location,education_degree,education_major,education_date_from,education_date_to,career_experiences,resume_html_template,resume_tailoring_note,created_by_member_id,created_at,updated_at,deleted_at";

export const trackingProfileRequestFields =
  "id,workspace_id,name,requested_by_member_id,status,reviewed_by_member_id,resolved_profile_id,created_at,updated_at,reviewed_at";

export const trackingJobMarketFields =
  "id,workspace_id,market_key,name,system,created_by_member_id,created_at,updated_at,deleted_at";

export const bidRecordFields =
  "id,workspace_id,job_market_id,job_title,company,job_link,bid_at,job_description,application_metadata,created_by_member_id,created_at,updated_at,deleted_at";

export const bidRecordProfileFields =
  "workspace_id,bid_id,profile_id,resume,resume_html,created_at";

export const interviewRecordFields =
  "id,workspace_id,bid_id,profile_id,step,start_at,end_at,time_zone,interview_link,notes,created_by_member_id,created_at,updated_at,deleted_at";

export const jobRecordFields =
  "id,workspace_id,bid_id,bidder_member_id,caller_member_id,worker_member_id,payment_handler_member_id,bidder_rate,caller_rate,worker_rate,discount_rate,created_by_member_id,created_at,updated_at,deleted_at";

export const paymentRecordFields =
  "id,workspace_id,job_record_id,payment_amount,bidder_member_id,caller_member_id,worker_member_id,payment_manager_member_id,bidder_amount,caller_amount,worker_amount,payment_manager_amount,status,created_by_member_id,paid_by_member_id,paid_at,created_at,updated_at,deleted_at";

export const customPaymentRecordFields =
  "id,workspace_id,member_id,name,amount,direction,created_by_member_id,recorded_at,created_at,updated_at,deleted_at";
