import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/features/legal/LegalPage";
import { TERMS } from "@/features/legal/content";

export const Route = createFileRoute("/terms")({
  component: () => <LegalPage doc={TERMS} />,
  head: () => ({
    meta: [
      { title: "Terms of Service · Zero Club" },
      { name: "description", content: "The rules for using Zero Club: accounts, tutors, content, community standards, payments, wallet and payouts." },
      { property: "og:title", content: "Terms of Service · Zero Club" },
      { property: "og:description", content: "The rules for using Zero Club: accounts, tutors, content, community standards, payments, wallet and payouts." },
    ],
  }),
});
