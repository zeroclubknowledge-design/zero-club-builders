import { createFileRoute } from "@tanstack/react-router";
import { BootcampForm } from "@/routes/app.tutor-studio.create";

export const Route = createFileRoute("/app/bootcamps_/$id/edit")({
  validateSearch: (search: Record<string, unknown>) => ({
    source: search.source === "institution" ? "institution" as const : "tutor" as const,
  }),
  component: EditBootcampPage,
});

function EditBootcampPage() {
  const { id } = Route.useParams();
  const { source } = Route.useSearch();
  const isInstitution = source === "institution";

  return (
    <BootcampForm
      bootcampId={id}
      returnTo={isInstitution ? "/app/institution-studio" : "/app/tutor-studio"}
      workspaceLabel={isInstitution ? "Institution Hub" : "Tutor Studio"}
    />
  );
}
