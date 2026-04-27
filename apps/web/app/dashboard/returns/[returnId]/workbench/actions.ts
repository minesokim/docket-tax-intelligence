"use server";

import { revalidatePath } from "next/cache";

import {
  IDS,
  answerOpenClarificationsForReturn,
  approveAllTaxFactsForReturn,
  completeDemoReviewForReturn,
  generateClientQuestions,
  generateExportPacket,
  generateWorkpapers,
  markReadyForReview,
  markReadyForSignature,
  markReadyToFileStub,
  receiveMissingDocumentForReturn,
  resetDocketData,
  resolveAllIssuesForReturn,
  runAIPrep,
  runContextReconciliation,
  runDocumentExtraction,
  runPersistedWorkflow,
  signReturnAuthorization,
} from "@docket/domain";

function getReturnId(formData: FormData): string {
  const returnId = formData.get("returnId");
  if (typeof returnId !== "string" || returnId.length === 0) {
    throw new Error("Missing returnId.");
  }
  return returnId;
}

function refresh(returnId: string) {
  revalidatePath(`/dashboard/returns/${returnId}/workbench`);
  revalidatePath("/dashboard/command-center");
  revalidatePath("/dashboard/clients/client-miguel-sandoval");
}

export async function runContextReconciliationAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => runContextReconciliation(data, returnId));
  refresh(returnId);
}

export async function runDocumentExtractionAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => runDocumentExtraction(data, returnId));
  refresh(returnId);
}

export async function runAIPrepAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => runAIPrep(data, returnId));
  refresh(returnId);
}

export async function runReviewerCheckAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => markReadyToFileStub(data, returnId, IDS.owner));
  refresh(returnId);
}

export async function markReadyForReviewAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => markReadyForReview(data, returnId, IDS.preparer));
  refresh(returnId);
}

export async function markReadyForSignatureAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => markReadyForSignature(data, returnId, IDS.reviewer));
  refresh(returnId);
}

export async function generateClientQuestionsAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => generateClientQuestions(data, returnId));
  refresh(returnId);
}

export async function generateWorkpapersAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => generateWorkpapers(data, returnId));
  refresh(returnId);
}

export async function generateExportPacketAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => generateExportPacket(data, returnId));
  refresh(returnId);
}

export async function answerOpenClarificationsAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => answerOpenClarificationsForReturn(data, returnId));
  refresh(returnId);
}

export async function receiveMissingDocumentAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => receiveMissingDocumentForReturn(data, returnId));
  refresh(returnId);
}

export async function approveAllTaxFactsAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => approveAllTaxFactsForReturn(data, returnId, IDS.reviewer));
  refresh(returnId);
}

export async function resolveAllIssuesAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => resolveAllIssuesForReturn(data, returnId, IDS.reviewer));
  refresh(returnId);
}

export async function signReturnAuthorizationAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => signReturnAuthorization(data, returnId));
  refresh(returnId);
}

export async function completeDemoReviewAction(formData: FormData) {
  const returnId = getReturnId(formData);
  runPersistedWorkflow((data) => completeDemoReviewForReturn(data, returnId, IDS.reviewer));
  refresh(returnId);
}

export async function resetDocketStateAction(formData: FormData) {
  const returnId = getReturnId(formData);
  resetDocketData();
  refresh(returnId);
}
