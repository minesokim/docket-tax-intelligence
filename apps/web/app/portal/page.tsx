import { redirect } from "next/navigation";

import { IDS } from "@docket/domain";

export default function PortalPage() {
  redirect(`/portal/returns/${IDS.taxReturn}`);
}
