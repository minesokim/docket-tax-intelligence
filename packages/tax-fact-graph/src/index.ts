export {
  assertMaterialTaxFactHasEvidence,
  computeTaxFactConfidence,
  materialFactHasEvidence,
  TaxFactSchema,
  EvidenceRefSchema,
} from "@docket/domain";
import type { Contradiction, DocketData, TaxFact } from "@docket/domain";

export const TAX_FACT_GRAPH_RULES = {
  noSourceNoTrustedFact: true,
  clientStatementStartsAsClaim: true,
  materialFactsRequireEvidenceOrHumanOverride: true,
} as const;

export type TaxFactGraphNodeType = "tax_fact" | "evidence" | "issue" | "contradiction" | "document" | "client_claim" | "authority";

export type TaxFactGraphNode = {
  id: string;
  type: TaxFactGraphNodeType;
  label: string;
  confidence?: number;
  status?: string;
};

export type TaxFactGraphEdge = {
  from: string;
  to: string;
  relationship: "SUPPORTED_BY" | "CREATED_FROM" | "CONTRADICTED_BY" | "RELATED_TO_ISSUE" | "CITED_BY";
};

export type TaxFactGraph = {
  nodes: TaxFactGraphNode[];
  edges: TaxFactGraphEdge[];
};

function pushNode(nodes: Map<string, TaxFactGraphNode>, node: TaxFactGraphNode) {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function contradictionPenalty(fact: TaxFact, contradictions: Contradiction[]): number {
  const related = contradictions.filter(
    (contradiction) =>
      contradiction.status !== "RESOLVED" &&
      contradiction.status !== "WAIVED_BY_REVIEWER" &&
      (contradiction.sourceIds.includes(fact.id) || fact.relatedIssueIds.some((issueId) => contradiction.sourceIds.includes(issueId))),
  );
  if (related.some((contradiction) => contradiction.severity === "RED")) return 0.25;
  if (related.some((contradiction) => contradiction.severity === "YELLOW")) return 0.12;
  return 0;
}

export function graphAdjustedFactConfidence(data: DocketData, fact: TaxFact): number {
  const evidenceAverage =
    fact.evidenceRefs.length === 0 ? 0 : fact.evidenceRefs.reduce((sum, evidence) => sum + evidence.confidence, 0) / fact.evidenceRefs.length;
  const corroborationBoost = Math.min(0.08, Math.max(0, fact.evidenceRefs.length - 1) * 0.04);
  const reviewBoost = fact.reviewStatus === "REVIEWER_APPROVED" || fact.reviewStatus === "PARTNER_OVERRIDE" ? 0.08 : 0;
  const penalty = contradictionPenalty(
    fact,
    data.contradictions.filter((contradiction) => contradiction.taxReturnId === fact.taxReturnId),
  );
  const base = fact.confidence * 0.55 + evidenceAverage * 0.35 + corroborationBoost + reviewBoost;
  return Number(Math.max(0, Math.min(1, base - penalty)).toFixed(3));
}

export function buildTaxFactGraph(data: DocketData, returnId: string): TaxFactGraph {
  const nodes = new Map<string, TaxFactGraphNode>();
  const edges: TaxFactGraphEdge[] = [];
  const taxFacts = data.taxFacts.filter((fact) => fact.taxReturnId === returnId);
  const issues = data.taxIssues.filter((issue) => issue.taxReturnId === returnId);
  const contradictions = data.contradictions.filter((contradiction) => contradiction.taxReturnId === returnId);

  for (const fact of taxFacts) {
    pushNode(nodes, {
      id: fact.id,
      type: "tax_fact",
      label: fact.label,
      confidence: graphAdjustedFactConfidence(data, fact),
      status: fact.status,
    });

    for (const evidence of fact.evidenceRefs) {
      pushNode(nodes, {
        id: evidence.id,
        type: "evidence",
        label: evidence.fieldLabel ?? evidence.sourceQuote ?? evidence.id,
        confidence: evidence.confidence,
      });
      edges.push({ from: fact.id, to: evidence.id, relationship: "SUPPORTED_BY" });
      if (evidence.sourceDocumentId) {
        const document = data.sourceDocuments.find((item) => item.id === evidence.sourceDocumentId);
        pushNode(nodes, {
          id: evidence.sourceDocumentId,
          type: "document",
          label: document?.fileName ?? evidence.sourceDocumentId,
          status: document?.documentClass,
        });
        edges.push({ from: evidence.id, to: evidence.sourceDocumentId, relationship: "CREATED_FROM" });
      }
    }

    for (const issueId of fact.relatedIssueIds) {
      const issue = issues.find((item) => item.id === issueId);
      pushNode(nodes, { id: issueId, type: "issue", label: issue?.title ?? issueId, status: issue?.status });
      edges.push({ from: fact.id, to: issueId, relationship: "RELATED_TO_ISSUE" });
    }
  }

  for (const contradiction of contradictions) {
    pushNode(nodes, { id: contradiction.id, type: "contradiction", label: contradiction.title, status: contradiction.status });
    for (const sourceId of contradiction.sourceIds) {
      pushNode(nodes, { id: sourceId, type: "tax_fact", label: sourceId });
      edges.push({ from: sourceId, to: contradiction.id, relationship: "CONTRADICTED_BY" });
    }
  }

  return { nodes: [...nodes.values()], edges };
}

export function linkedSourceIdsForFact(data: DocketData, factId: string): string[] {
  const fact = data.taxFacts.find((item) => item.id === factId);
  if (!fact) return [];
  const graph = buildTaxFactGraph(data, fact.taxReturnId);
  const visited = new Set<string>();
  const queue = [factId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of graph.edges.filter((item) => item.from === current || item.to === current)) {
      const next = edge.from === current ? edge.to : edge.from;
      if (!visited.has(next)) queue.push(next);
    }
  }
  return [...visited].filter((id) => id !== factId);
}
