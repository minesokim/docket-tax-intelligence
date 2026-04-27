export { getKnowledgeAdmin, runKnowledgeSync } from "@docket/domain";

export const AUTHORITY_RANKING = [
  "IRC_STATUTE",
  "TREASURY_REGULATION",
  "FEDERAL_REGISTER",
  "INTERNAL_REVENUE_BULLETIN",
  "IRS_FORM_INSTRUCTION",
  "IRS_PUBLICATION",
  "IRS_FAQ",
  "STATE_STATUTE",
  "STATE_DOR_GUIDANCE",
  "COURT_CASE",
  "SECONDARY_ANALYSIS",
] as const;

type AuthorityLevel = (typeof AUTHORITY_RANKING)[number];

export type OfficialAuthorityDocument = {
  id: string;
  title: string;
  authorityLevel: AuthorityLevel;
  sourceUrl: string;
  jurisdiction: "US";
  publisher: "IRS" | "Federal Register" | "eCFR";
  topicTags: string[];
};

export type RetrievedAuthority = OfficialAuthorityDocument & {
  score: number;
  retrievedAt: string;
  pageLastUpdated: string | null;
  snippets: string[];
  fetchStatus: "LIVE" | "FAILED";
  error: string | null;
};

export type AuthorityResearchResult = {
  query: string;
  retrievedAt: string;
  sources: RetrievedAuthority[];
  answer: {
    headline: string;
    paragraphs: string[];
    reasoningSummary: string[];
    nextSteps: string[];
    caveat: string;
  };
};

const OFFICIAL_AUTHORITY_CATALOG: OfficialAuthorityDocument[] = [
  {
    id: "irs-form-2553",
    title: "About Form 2553, Election by a Small Business Corporation",
    authorityLevel: "IRS_FORM_INSTRUCTION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-form-2553",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["s corporation", "s corp", "small business corporation", "form 2553", "election"],
  },
  {
    id: "irs-pub-463",
    title: "About Publication 463, Travel, Gift, and Car Expenses",
    authorityLevel: "IRS_PUBLICATION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-463",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["mileage", "travel", "car", "vehicle", "records", "substantiation", "business purpose"],
  },
  {
    id: "irs-pub-587",
    title: "About Publication 587, Business Use of Your Home",
    authorityLevel: "IRS_PUBLICATION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-587",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["home office", "business use of home", "exclusive use", "regular use", "daycare"],
  },
  {
    id: "irs-schedule-c",
    title: "About Schedule C (Form 1040), Profit or Loss from Business",
    authorityLevel: "IRS_FORM_INSTRUCTION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["schedule c", "gross receipts", "self employment", "business income", "sole proprietor"],
  },
  {
    id: "irs-pub-1345",
    title: "Publication 1345, Handbook for Authorized IRS e-file Providers",
    authorityLevel: "IRS_PUBLICATION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-1345",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["e-file", "efile", "8879", "ero", "signature authorization"],
  },
  {
    id: "irs-circular-230",
    title: "Circular 230, Regulations Governing Practice before the IRS",
    authorityLevel: "TREASURY_REGULATION",
    sourceUrl: "https://www.irs.gov/tax-professionals/circular-230-tax-professionals",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["circular 230", "tax professional", "diligence", "practice before the irs", "ethics"],
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function queryTokens(query: string): string[] {
  const stopWords = new Set(["a", "an", "and", "are", "for", "how", "is", "of", "or", "the", "to", "what", "when", "with"]);
  return normalize(query)
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function authorityRank(level: AuthorityLevel): number {
  return AUTHORITY_RANKING.indexOf(level);
}

export function rankAuthorityCatalog(query: string, catalog: OfficialAuthorityDocument[] = OFFICIAL_AUTHORITY_CATALOG): OfficialAuthorityDocument[] {
  const normalizedQuery = normalize(query);
  const tokens = queryTokens(query);
  return catalog
    .map((source) => {
      const haystack = normalize(`${source.title} ${source.topicTags.join(" ")}`);
      const tokenScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 2 : 0), 0);
      const phraseScore = source.topicTags.reduce((score, tag) => score + (normalizedQuery.includes(normalize(tag)) ? 8 : 0), 0);
      return { source, score: tokenScore + phraseScore + (20 - authorityRank(source.authorityLevel)) / 10 };
    })
    .filter((item) => item.score > 1.5)
    .sort((a, b) => b.score - a.score || authorityRank(a.source.authorityLevel) - authorityRank(b.source.authorityLevel))
    .map((item) => item.source);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function pageLastUpdated(text: string): string | null {
  const match = text.match(/Page Last Reviewed or Updated:\s*([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4})/i);
  return match?.[1] ?? null;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 60 && sentence.length < 420);
}

function sourceSnippets(text: string, query: string, source: OfficialAuthorityDocument): string[] {
  const tokens = new Set([...queryTokens(query), ...source.topicTags.flatMap((tag) => queryTokens(tag))]);
  const scored = splitSentences(text)
    .map((sentence) => {
      const normalizedSentence = normalize(sentence);
      const score = Array.from(tokens).reduce((sum, token) => sum + (normalizedSentence.includes(token) ? 1 : 0), 0);
      return { sentence, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.sentence);

  if (scored.length > 0) return scored;
  const titlePrefix = source.title.split(",")[0] ?? source.title;
  const fallback = splitSentences(text).find((sentence) => sentence.includes(titlePrefix));
  return fallback ? [fallback] : [`Retrieved ${source.title} from ${source.publisher}; no concise matching snippet was extracted.`];
}

async function fetchOfficialSource(source: OfficialAuthorityDocument, query: string, retrievedAt: string): Promise<RetrievedAuthority> {
  try {
    const response = await fetch(source.sourceUrl, {
      cache: "no-store",
      headers: { "user-agent": "DocketTaxIntelligence/0.1 (+local foundation build)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = htmlToText(await response.text());
    return {
      ...source,
      score: rankAuthorityCatalog(query, [source]).length > 0 ? 1 : 0,
      retrievedAt,
      pageLastUpdated: pageLastUpdated(text),
      snippets: sourceSnippets(text, query, source),
      fetchStatus: "LIVE",
      error: null,
    };
  } catch (error) {
    return {
      ...source,
      score: 0,
      retrievedAt,
      pageLastUpdated: null,
      snippets: [],
      fetchStatus: "FAILED",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function answerFromAuthorities(query: string, sources: RetrievedAuthority[]): AuthorityResearchResult["answer"] {
  const liveSources = sources.filter((source) => source.fetchStatus === "LIVE");
  const primary = liveSources[0] ?? null;
  const sourceList = liveSources.map((source) => `${source.title} (${source.authorityLevel.replaceAll("_", " ")})`).join("; ");

  return {
    headline: primary ? `Retrieved ${liveSources.length} current official source${liveSources.length === 1 ? "" : "s"} for this tax question.` : "No official source could be retrieved.",
    paragraphs:
      liveSources.length > 0
        ? [
            `Docket retrieved official authority for: "${query}". The strongest retrieved source is ${primary?.title ?? "the first live source"}.`,
            `Relevant retrieved sources: ${sourceList}. The answer should be treated as research support until a professional reviews the authority and applies it to client facts.`,
            `Key extracted support: ${liveSources.flatMap((source) => source.snippets).slice(0, 2).join(" ")}`,
          ]
        : [
            "Docket could not retrieve official authority for this query during this run.",
            "A trusted tax conclusion should remain blocked until official authority is available and reviewed.",
          ],
    reasoningSummary: [
      "Retrieved current official-source pages at request time instead of using model memory.",
      "Ranked candidate sources by topic match and authority level.",
      "Extracted snippets from retrieved source text and preserved source URL, publisher, authority level, retrieval time, and page update metadata.",
    ],
    nextSteps:
      liveSources.length > 0
        ? [
            "Review the cited official source pages and any linked form instructions or PDFs.",
            "Apply the authority to the taxpayer type, tax year, jurisdiction, and facts.",
            "Escalate unsupported or judgment-heavy positions for reviewer approval before client-facing advice.",
          ]
        : ["Retry retrieval, broaden the query, or add a new official source adapter for this topic."],
    caveat: "This is not final client-facing tax advice. Docket still requires professional review before relying on the conclusion.",
  };
}

export async function retrieveOfficialAuthority(query: string): Promise<AuthorityResearchResult> {
  const retrievedAt = new Date().toISOString();
  const ranked = rankAuthorityCatalog(query).slice(0, 4);
  const candidates = ranked.length > 0 ? ranked : OFFICIAL_AUTHORITY_CATALOG.slice(0, 3);
  const sources = await Promise.all(candidates.map((source) => fetchOfficialSource(source, query, retrievedAt)));
  const sortedSources = sources.sort(
    (a, b) =>
      (b.fetchStatus === "LIVE" ? 1 : 0) - (a.fetchStatus === "LIVE" ? 1 : 0) ||
      authorityRank(a.authorityLevel) - authorityRank(b.authorityLevel),
  );

  return {
    query,
    retrievedAt,
    sources: sortedSources,
    answer: answerFromAuthorities(query, sortedSources),
  };
}
