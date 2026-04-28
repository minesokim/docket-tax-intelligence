"use server";

import { revalidatePath } from "next/cache";

import { runPersistedWorkflow, uploadTextDocumentForReturn } from "@docket/domain";

function getReturnId(formData: FormData): string {
  const returnId = formData.get("returnId");
  if (typeof returnId !== "string" || !returnId.trim()) throw new Error("Missing returnId.");
  return returnId;
}

export async function uploadPortalDocumentAction(formData: FormData) {
  const returnId = getReturnId(formData);
  const document = formData.get("document");
  if (!(document instanceof File) || document.size === 0) throw new Error("Choose a text document to upload.");
  const text = await document.text();

  runPersistedWorkflow((data) =>
    uploadTextDocumentForReturn(data, returnId, {
      fileName: document.name,
      text,
      uploadedBy: "CLIENT",
    }),
  );

  revalidatePath(`/portal/returns/${returnId}/documents`);
  revalidatePath(`/portal/returns/${returnId}`);
  revalidatePath(`/dashboard/returns/${returnId}/workbench`);
  revalidatePath("/dashboard/documents");
}
