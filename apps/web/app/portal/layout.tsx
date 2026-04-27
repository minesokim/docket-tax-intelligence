import type React from "react";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="portal-shell">{children}</div>;
}
