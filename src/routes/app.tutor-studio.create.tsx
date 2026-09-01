import { createFileRoute } from "@tanstack/react-router";
import { BootcampForm } from "@/features/bootcamps/BootcampForm";

export const Route = createFileRoute("/app/tutor-studio/create")({
  component: CreateBootcamp,
});

function CreateBootcamp() {
  return <BootcampForm />;
}
