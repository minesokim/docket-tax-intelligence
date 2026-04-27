import Link from "next/link";
import type React from "react";

import type {
  AuditEvent,
  ClientClarification,
  DeductionOpportunity,
  EvidenceRef,
  RiskLevel,
  SourceDocument,
  TaxFact,
  TaxIssue,
  Workpaper,
} from "@docket/domain";

const navItems = [
  { href: "/dashboard/command-center", label: "Command Center" },
  { href: "/dashboard/clients", label: "Clients" },
  { href: "/dashboard/returns", label: "Returns" },
  { href: "/dashboard/ai", label: "AI" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/dashboard/conversations", label: "Conversations" },
  { href: "/dashboard/knowledge", label: "Knowledge" },
  { href: "/dashboard/evals", label: "Evals" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/portal", label: "Client Portal" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard/command-center">
          <span className="brand-mark">D</span>
          <span>
            <strong>Docket</strong>
            <small>Tax intelligence</small>
          </span>
        </Link>
        <nav className="side-nav" aria-label="Primary">
          {navItems.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-status">
          <StatusBadge label="Mock AI" tone="blue" />
          <StatusBadge label="Knowledge current" tone="green" />
          <StatusBadge label="E-file stubbed" tone="yellow" />
        </div>
      </aside>
      <div className="main-shell">
        <header className="top-nav">
          <div className="command-search">Search clients, documents, issues, workpapers</div>
          <div className="top-nav-right">
            <StatusBadge label="Riverbend Tax Advisors" tone="neutral" />
            <StatusBadge label="Sara Patel" tone="green" />
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="header-actions">{actions}</div> : null}
    </section>
  );
}

export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MetricCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className={`metric-card tone-${tone ?? "neutral"}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: string }) {
  return <span className={`status-badge tone-${tone}`}>{label}</span>;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const tone = risk === "RED" ? "red" : risk === "YELLOW" ? "yellow" : "green";
  return <StatusBadge label={risk} tone={tone} />;
}

export function Meter({ value, label, tone = "blue" }: { value: number; label: string; tone?: string }) {
  return (
    <div className="meter">
      <div className="meter-row">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="meter-track">
        <div className={`meter-fill tone-${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function EvidenceBadge({ evidence }: { evidence: EvidenceRef }) {
  return (
    <span className="evidence-badge" title={evidence.sourceQuote ?? evidence.fieldLabel ?? evidence.sourceType}>
      {evidence.sourceType.replaceAll("_", " ")} · {Math.round(evidence.confidence * 100)}%
    </span>
  );
}

export function AuthorityBadge({ label, level, current }: { label: string; level: string; current: boolean }) {
  return (
    <div className="authority-badge">
      <StatusBadge label={current ? "Current authority" : "Stale authority"} tone={current ? "green" : "red"} />
      <span>{label}</span>
      <small>{level.replaceAll("_", " ")}</small>
    </div>
  );
}

export function SourceDocumentCard({ document }: { document: SourceDocument }) {
  return (
    <article className="item-card">
      <div className="item-card-title">
        <h3>{document.fileName}</h3>
        <StatusBadge label={document.documentClass.replaceAll("_", " ")} tone="blue" />
      </div>
      <p>
        Tax year {document.taxYear ?? "unknown"} · {document.processedAt ? "processed" : "pending"}
      </p>
      <div className="pill-row">
        {document.fixtureFields.slice(0, 3).map((field) => (
          <span className="mini-pill" key={field.label}>
            {field.label}: {String(field.value)}
          </span>
        ))}
      </div>
    </article>
  );
}

export function TaxFactRow({ fact }: { fact: TaxFact }) {
  return (
    <div className="fact-row">
      <div>
        <strong>{fact.label}</strong>
        <p>
          {String(fact.value)} · {fact.status.replaceAll("_", " ")} · {fact.reviewStatus.replaceAll("_", " ")}
        </p>
      </div>
      <div className="fact-evidence">
        <StatusBadge label={`${Math.round(fact.confidence * 100)}%`} tone={fact.confidence > 0.9 ? "green" : "yellow"} />
        {fact.evidenceRefs.slice(0, 2).map((evidence) => (
          <EvidenceBadge evidence={evidence} key={evidence.id} />
        ))}
      </div>
    </div>
  );
}

export function IssueCard({ issue }: { issue: TaxIssue }) {
  return (
    <article className="item-card issue-card">
      <div className="item-card-title">
        <h3>{issue.title}</h3>
        <RiskBadge risk={issue.riskLevel} />
      </div>
      <p>{issue.description}</p>
      <div className="issue-footer">
        <StatusBadge label={issue.blocker ? "Firm policy blocker" : "Nonblocking"} tone={issue.blocker ? "red" : "yellow"} />
        <span>{issue.recommendedAction}</span>
      </div>
    </article>
  );
}

export function ClientQuestionCard({ question }: { question: ClientClarification }) {
  return (
    <article className="item-card">
      <div className="item-card-title">
        <h3>{question.question}</h3>
        <StatusBadge label={question.status.replaceAll("_", " ")} tone={question.status === "ANSWERED" ? "green" : "yellow"} />
      </div>
      {question.answer ? <p className="answer">Answer: {question.answer}</p> : <p>Awaiting client answer.</p>}
      <div className="pill-row">
        <StatusBadge label={question.reviewerApproved ? "Reviewer approved to send" : "Needs review"} tone={question.reviewerApproved ? "green" : "yellow"} />
      </div>
    </article>
  );
}

export function OpportunityCard({ opportunity }: { opportunity: DeductionOpportunity }) {
  return (
    <article className="item-card">
      <div className="item-card-title">
        <h3>{opportunity.title}</h3>
        <RiskBadge risk={opportunity.riskLevel} />
      </div>
      <p>{opportunity.whyDetected}</p>
      <div className="split-list">
        <div>
          <strong>Missing facts</strong>
          {opportunity.missingFacts.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div>
          <strong>Reviewer action</strong>
          <span>{opportunity.reviewerAction}</span>
        </div>
      </div>
    </article>
  );
}

export function WorkpaperPanel({ workpaper }: { workpaper: Workpaper }) {
  return (
    <article className="workpaper">
      <div className="item-card-title">
        <h3>{workpaper.title}</h3>
        <StatusBadge label={workpaper.status.replaceAll("_", " ")} tone="blue" />
      </div>
      <p>{workpaper.body}</p>
      <small>
        Snapshot {workpaper.knowledgeSnapshotId} · Evidence refs {workpaper.evidenceRefIds.length}
      </small>
    </article>
  );
}

export function ReviewGatePanel({ title, pass, blockers }: { title: string; pass: boolean; blockers: string[] }) {
  return (
    <div className={`review-gate ${pass ? "pass" : "blocked"}`}>
      <div className="item-card-title">
        <h3>{title}</h3>
        <StatusBadge label={pass ? "Pass" : "Blocked"} tone={pass ? "green" : "red"} />
      </div>
      {blockers.length > 0 ? (
        <ul>
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : (
        <p>No gate blockers.</p>
      )}
    </div>
  );
}

export function ExportPacketPanel({ state, notice, packetJson }: { state: string; notice: string; packetJson: Record<string, unknown> }) {
  return (
    <article className="export-panel">
      <div className="item-card-title">
        <h3>Export packet</h3>
        <StatusBadge label={state.replaceAll("_", " ")} tone="blue" />
      </div>
      <p>{notice}</p>
      <pre>{JSON.stringify(packetJson, null, 2)}</pre>
    </article>
  );
}

export function AuditTrail({ events }: { events: AuditEvent[] }) {
  return (
    <div className="timeline">
      {events.map((event) => (
        <div className="timeline-event" key={event.id}>
          <StatusBadge label={event.eventType.replaceAll("_", " ")} tone="blue" />
          <strong>{event.summary}</strong>
          <small>{new Date(event.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</small>
        </div>
      ))}
    </div>
  );
}

export function ActionBar({ returnId }: { returnId: string }) {
  const actions = [
    "Run Context Reconciliation",
    "Run Document Extraction",
    "Run AI Prep",
    "Run Reviewer Check",
    "Generate Client Questions",
    "Generate Workpapers",
    "Generate Export Packet",
    "Mark Ready for Review",
    "Mark Ready for Signature",
    "Mark Ready to File",
  ];
  return (
    <div className="action-bar">
      {actions.map((action) => (
        <button type="button" key={action} title={`${action} for ${returnId}`}>
          {action}
        </button>
      ))}
    </div>
  );
}
