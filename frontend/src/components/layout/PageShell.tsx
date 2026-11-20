import { useEffect, type ReactNode } from "react";

import { BRAND_NAME } from "../../config/catalog";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** Header + scrolling page + full footer, for every page except the consultation workspace. */
export function PageShell({ title, children }: { title?: string; children: ReactNode }) {
  useDocumentTitle(title);
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${BRAND_NAME}` : `${BRAND_NAME} · Find a doctor and book in minutes`;
  }, [title]);
}
