import {
  answerOpenClarificationsAction,
  approveAllTaxFactsAction,
  completeDemoReviewAction,
  generateClientQuestionsAction,
  generateExportPacketAction,
  generateWorkpapersAction,
  markReadyForReviewAction,
  markReadyForSignatureAction,
  receiveMissingDocumentAction,
  resetDocketStateAction,
  resolveAllIssuesAction,
  runAIPrepAction,
  runContextReconciliationAction,
  runDocumentExtractionAction,
  runReviewerCheckAction,
  signReturnAuthorizationAction,
} from "./actions";

const workflowActions = [
  { label: "Run Context Reconciliation", action: runContextReconciliationAction },
  { label: "Run Document Extraction", action: runDocumentExtractionAction },
  { label: "Run AI Prep", action: runAIPrepAction },
  { label: "Generate Client Questions", action: generateClientQuestionsAction },
  { label: "Generate Workpapers", action: generateWorkpapersAction },
  { label: "Generate Export Packet", action: generateExportPacketAction },
];

const reviewActions = [
  { label: "Answer Open Clarifications", action: answerOpenClarificationsAction },
  { label: "Receive Missing 1099-B", action: receiveMissingDocumentAction },
  { label: "Approve All Facts", action: approveAllTaxFactsAction },
  { label: "Resolve All Issues", action: resolveAllIssuesAction },
  { label: "Mark Ready for Review", action: markReadyForReviewAction },
  { label: "Mark Ready for Signature", action: markReadyForSignatureAction },
  { label: "Sign 8879 Stub", action: signReturnAuthorizationAction },
  { label: "Run Reviewer Check", action: runReviewerCheckAction },
  { label: "Complete Demo Review", action: completeDemoReviewAction },
  { label: "Reset Seed State", action: resetDocketStateAction },
];

export function WorkbenchActions({ returnId }: { returnId: string }) {
  return (
    <div className="workflow-action-stack">
      <div className="action-bar" aria-label="Return workflow actions">
        {workflowActions.map((item) => (
          <form action={item.action} key={item.label}>
            <input type="hidden" name="returnId" value={returnId} />
            <button type="submit">{item.label}</button>
          </form>
        ))}
      </div>
      <div className="action-bar review-actions" aria-label="Review lifecycle actions">
        {reviewActions.map((item) => (
          <form action={item.action} key={item.label}>
            <input type="hidden" name="returnId" value={returnId} />
            <button type="submit">{item.label}</button>
          </form>
        ))}
      </div>
    </div>
  );
}
