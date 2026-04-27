-- Docket Tax Intelligence Platform foundation schema.
-- PostgreSQL-compatible and pgvector-ready. The app uses seed data locally,
-- but these tables model the production persistence boundary.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE firms (
  id text PRIMARY KEY,
  name text NOT NULL,
  default_jurisdiction text NOT NULL,
  tax_knowledge_freshness_hours integer NOT NULL DEFAULT 72,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE firm_users (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  display_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  responsiveness_score integer NOT NULL,
  average_response_days numeric(6,2) NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_contacts (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  name text NOT NULL,
  relationship text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL
);

CREATE TABLE tax_household_members (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  name text NOT NULL,
  relationship text NOT NULL,
  residency_periods jsonb NOT NULL DEFAULT '[]',
  support_facts jsonb NOT NULL DEFAULT '[]',
  student_status text
);

CREATE TABLE engagements (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  client_id text NOT NULL REFERENCES clients(id),
  name text NOT NULL,
  tax_year integer NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL
);

CREATE TABLE engagement_scopes (
  id text PRIMARY KEY,
  engagement_id text NOT NULL REFERENCES engagements(id),
  scope_type text NOT NULL,
  support_level text NOT NULL
);

CREATE TABLE tax_knowledge_snapshots (
  id text PRIMARY KEY,
  label text NOT NULL,
  jurisdiction text NOT NULL,
  tax_year integer NOT NULL,
  source_version_ids jsonb NOT NULL DEFAULT '[]',
  last_sync_status text NOT NULL,
  last_synced_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tax_rule_packages (
  id text PRIMARY KEY,
  version text NOT NULL,
  tax_year integer NOT NULL,
  status text NOT NULL,
  rule_version_ids jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE tax_returns (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  client_id text NOT NULL REFERENCES clients(id),
  engagement_id text NOT NULL REFERENCES engagements(id),
  tax_year integer NOT NULL,
  return_type text NOT NULL,
  jurisdiction text NOT NULL,
  status text NOT NULL,
  readiness_score integer NOT NULL DEFAULT 0,
  extension_risk_score integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL,
  assigned_preparer_id text REFERENCES firm_users(id),
  assigned_reviewer_id text REFERENCES firm_users(id),
  knowledge_snapshot_id text REFERENCES tax_knowledge_snapshots(id),
  rule_package_id text REFERENCES tax_rule_packages(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_documents (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  client_id text NOT NULL REFERENCES clients(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  file_name text NOT NULL,
  document_class text NOT NULL,
  tax_year integer,
  source_type text NOT NULL,
  uploaded_by text NOT NULL,
  received_at timestamptz NOT NULL,
  processed_at timestamptz,
  duplicate_of_document_id text REFERENCES source_documents(id),
  storage_key text NOT NULL,
  fixture_fields jsonb NOT NULL DEFAULT '[]',
  suspicious_text text
);

CREATE TABLE document_extractions (
  id text PRIMARY KEY,
  source_document_id text NOT NULL REFERENCES source_documents(id),
  provider text NOT NULL,
  status text NOT NULL,
  confidence numeric(5,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE extracted_fields (
  id text PRIMARY KEY,
  extraction_id text NOT NULL REFERENCES document_extractions(id),
  source_document_id text NOT NULL REFERENCES source_documents(id),
  label text NOT NULL,
  value jsonb NOT NULL,
  confidence numeric(5,4) NOT NULL,
  normalized_fact_type text
);

CREATE TABLE document_flags (
  id text PRIMARY KEY,
  source_document_id text NOT NULL REFERENCES source_documents(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  flag_type text NOT NULL,
  severity text NOT NULL,
  message text NOT NULL,
  status text NOT NULL
);

CREATE TABLE evidence_refs (
  id text PRIMARY KEY,
  source_type text NOT NULL,
  source_id text NOT NULL,
  source_document_id text REFERENCES source_documents(id),
  conversation_id text,
  portal_answer_id text,
  tax_authority_source_id text,
  prior_year_return_id text,
  page_number integer,
  field_label text,
  bbox jsonb,
  source_quote text,
  confidence numeric(5,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tax_facts (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  client_id text NOT NULL REFERENCES clients(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  fact_type text NOT NULL,
  label text NOT NULL,
  value jsonb NOT NULL,
  tax_year integer NOT NULL,
  jurisdiction text NOT NULL,
  materiality text NOT NULL,
  status text NOT NULL,
  confidence numeric(5,4) NOT NULL,
  review_status text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]',
  evidence_ref_ids jsonb NOT NULL DEFAULT '[]',
  related_issue_ids jsonb NOT NULL DEFAULT '[]',
  reviewer_id text REFERENCES firm_users(id),
  accepted_at timestamptz
);

CREATE TABLE conversations (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  client_id text NOT NULL REFERENCES clients(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  channel text NOT NULL,
  title text NOT NULL,
  source_provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id),
  author_type text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_claims (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  claim_type text NOT NULL,
  statement text NOT NULL,
  normalized_value jsonb,
  source_type text NOT NULL,
  source_id text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]',
  evidence_ref_ids jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_insights (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  insight_type text NOT NULL,
  summary text NOT NULL,
  risk_level text NOT NULL,
  source_quote text NOT NULL,
  related_issue_id text
);

CREATE TABLE prior_year_patterns (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  pattern_type text NOT NULL,
  prior_tax_year integer NOT NULL,
  description text NOT NULL,
  expected_current_year_document_class text,
  resolved_by_document_id text REFERENCES source_documents(id),
  risk_level text NOT NULL
);

CREATE TABLE missing_documents (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  expected_document_class text NOT NULL,
  reason text NOT NULL,
  source_ids jsonb NOT NULL DEFAULT '[]',
  severity text NOT NULL,
  status text NOT NULL
);

CREATE TABLE contradictions (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  title text NOT NULL,
  description text NOT NULL,
  source_ids jsonb NOT NULL DEFAULT '[]',
  severity text NOT NULL,
  status text NOT NULL
);

CREATE TABLE deduction_opportunities (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  opportunity_type text NOT NULL,
  title text NOT NULL,
  why_detected text NOT NULL,
  source_ids jsonb NOT NULL DEFAULT '[]',
  missing_facts jsonb NOT NULL DEFAULT '[]',
  missing_documents jsonb NOT NULL DEFAULT '[]',
  risk_level text NOT NULL,
  status text NOT NULL,
  client_question text NOT NULL,
  reviewer_action text NOT NULL
);

CREATE TABLE tax_issues (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  client_id text NOT NULL REFERENCES clients(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  issue_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  risk_level text NOT NULL,
  status text NOT NULL,
  blocker boolean NOT NULL DEFAULT false,
  source_ids jsonb NOT NULL DEFAULT '[]',
  recommended_action text NOT NULL,
  assigned_to_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE client_clarifications (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  related_issue_id text REFERENCES tax_issues(id),
  question text NOT NULL,
  generated_by_ai_run_id text,
  status text NOT NULL,
  answer text,
  answered_at timestamptz,
  reviewer_approved boolean NOT NULL DEFAULT false,
  evidence_refs jsonb NOT NULL DEFAULT '[]',
  evidence_ref_ids jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE workpapers (
  id text PRIMARY KEY,
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  title text NOT NULL,
  section text NOT NULL,
  body text NOT NULL,
  evidence_ref_ids jsonb NOT NULL DEFAULT '[]',
  knowledge_snapshot_id text NOT NULL REFERENCES tax_knowledge_snapshots(id),
  status text NOT NULL
);

CREATE TABLE tax_authority_sources (
  id text PRIMARY KEY,
  jurisdiction text NOT NULL,
  title text NOT NULL,
  authority_level text NOT NULL,
  source_url text NOT NULL,
  topic_tags jsonb NOT NULL DEFAULT '[]',
  retrieved_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL,
  effective_date date NOT NULL,
  nonprecedential boolean NOT NULL DEFAULT false
);

CREATE TABLE tax_authority_versions (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES tax_authority_sources(id),
  content_hash text NOT NULL,
  supersedes_version_id text REFERENCES tax_authority_versions(id),
  embedding jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tax_source_ingestion_runs (
  id text PRIMARY KEY,
  source_provider text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  changed_source_ids jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE tax_source_changes (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES tax_authority_sources(id),
  title text NOT NULL,
  impact_level text NOT NULL,
  affected_forms jsonb NOT NULL DEFAULT '[]',
  affected_tax_years jsonb NOT NULL DEFAULT '[]',
  review_status text NOT NULL
);

CREATE TABLE tax_impact_assessments (
  id text PRIMARY KEY,
  source_change_id text NOT NULL REFERENCES tax_source_changes(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  summary text NOT NULL,
  requires_reviewer_approval boolean NOT NULL DEFAULT false
);

CREATE TABLE ai_reasoning_runs (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  task text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  tool_version text NOT NULL,
  knowledge_snapshot_id text REFERENCES tax_knowledge_snapshots(id),
  input_source_ids jsonb NOT NULL DEFAULT '[]',
  output_schema text NOT NULL,
  output jsonb NOT NULL,
  confidence numeric(5,4) NOT NULL,
  cost_estimate_usd numeric(12,4) NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL,
  review_status text NOT NULL,
  human_edits text,
  final_outcome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_prep_runs (
  id text PRIMARY KEY,
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  status text NOT NULL,
  ai_reasoning_run_ids jsonb NOT NULL DEFAULT '[]',
  created_fact_ids jsonb NOT NULL DEFAULT '[]',
  created_issue_ids jsonb NOT NULL DEFAULT '[]',
  created_clarification_ids jsonb NOT NULL DEFAULT '[]',
  created_workpaper_ids jsonb NOT NULL DEFAULT '[]',
  cost_estimate_usd numeric(12,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consent_records (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  client_id text NOT NULL REFERENCES clients(id),
  tax_return_id text REFERENCES tax_returns(id),
  consent_type text NOT NULL,
  scope text NOT NULL,
  consent_text_version text NOT NULL,
  granted boolean NOT NULL,
  granted_at timestamptz,
  revoked_at timestamptz,
  signed_by text NOT NULL,
  ip_address text,
  user_agent text,
  related_document_id text REFERENCES source_documents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  client_id text REFERENCES clients(id),
  tax_return_id text REFERENCES tax_returns(id),
  actor_type text NOT NULL,
  actor_id text,
  event_type text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE firm_policies (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  policy_type text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL,
  conditions_json jsonb NOT NULL DEFAULT '{}',
  action text NOT NULL,
  required_role text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE security_settings (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  mfa_required boolean NOT NULL DEFAULT true,
  session_logging_enabled boolean NOT NULL DEFAULT true,
  pii_logging_allowed boolean NOT NULL DEFAULT false
);

CREATE TABLE integration_connections (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  provider text NOT NULL,
  status text NOT NULL,
  external_calls_allowed boolean NOT NULL DEFAULT false
);

CREATE TABLE signature_authorizations (
  id text PRIMARY KEY,
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  authorization_type text NOT NULL,
  status text NOT NULL,
  signed_at timestamptz,
  retention_requirement text NOT NULL
);

CREATE TABLE export_packages (
  id text PRIMARY KEY,
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  state text NOT NULL,
  generated_at timestamptz,
  packet_json jsonb NOT NULL DEFAULT '{}',
  efile_disabled_notice text NOT NULL
);

CREATE TABLE post_filing_events (
  id text PRIMARY KEY,
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  event_type text NOT NULL,
  status text NOT NULL
);

-- Document-style tables keep the foundation schema complete for
-- model-risk, scope, and future workflow objects whose fields will likely
-- change before full production normalization.
CREATE TABLE client_context_facts (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  payload jsonb NOT NULL
);

CREATE TABLE tax_flags (
  id text PRIMARY KEY,
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  payload jsonb NOT NULL
);

CREATE TABLE reviewer_notes (
  id text PRIMARY KEY,
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  issue_id text REFERENCES tax_issues(id),
  payload jsonb NOT NULL
);

CREATE TABLE tax_citations (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES tax_authority_sources(id),
  payload jsonb NOT NULL
);

CREATE TABLE tax_rules (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE tax_rule_versions (
  id text PRIMARY KEY,
  rule_id text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE return_knowledge_snapshots (
  id text PRIMARY KEY,
  tax_return_id text NOT NULL REFERENCES tax_returns(id),
  knowledge_snapshot_id text NOT NULL REFERENCES tax_knowledge_snapshots(id),
  rule_package_id text NOT NULL REFERENCES tax_rule_packages(id),
  payload jsonb NOT NULL
);

CREATE TABLE model_providers (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE prompt_versions (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE model_eval_runs (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE tax_pro_benchmark_cases (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE reviewer_corrections (
  id text PRIMARY KEY,
  ai_run_id text NOT NULL REFERENCES ai_reasoning_runs(id),
  payload jsonb NOT NULL
);

CREATE TABLE expert_preference_ratings (
  id text PRIMARY KEY,
  benchmark_case_id text NOT NULL REFERENCES tax_pro_benchmark_cases(id),
  payload jsonb NOT NULL
);

CREATE TABLE data_retention_policies (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  payload jsonb NOT NULL
);

CREATE TABLE subprocessor_records (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id),
  payload jsonb NOT NULL
);

CREATE INDEX tax_returns_firm_status_idx ON tax_returns(firm_id, status);
CREATE INDEX source_documents_return_idx ON source_documents(tax_return_id, document_class);
CREATE INDEX tax_facts_return_status_idx ON tax_facts(tax_return_id, status);
CREATE INDEX tax_issues_return_risk_idx ON tax_issues(tax_return_id, risk_level, status);
CREATE INDEX audit_events_return_created_idx ON audit_events(tax_return_id, created_at DESC);
