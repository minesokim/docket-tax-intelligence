import type React from "react";

import { AppShell } from "../../src/components/docket-ui";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
