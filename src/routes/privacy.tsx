import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/features/legal/LegalPage";
import { PRIVACY } from "@/features/legal/content";

export const Route = createFileRoute("/privacy")({
  component: () => <LegalPage doc={PRIVACY} />,
  head: () => ({
    meta: [
      { title: "Privacy Policy · Zero Club" },
      { name: "description", content: "How Zero Club collects, uses and protects your personal information, and your rights under the Nigeria Data Protection Act 2023." },
      { property: "og:title", content: "Privacy Policy · Zero Club" },
      { property: "og:description", content: "How Zero Club collects, uses and protects your personal information, and your rights under the Nigeria Data Protection Act 2023." },
    ],
  }),
});
