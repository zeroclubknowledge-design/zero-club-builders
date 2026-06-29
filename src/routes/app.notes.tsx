import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/app/notes')({
  component: NotesLayout,
});

function NotesLayout() {
  return (
    <div className="flex h-full w-full flex-col bg-background">
      <Outlet />
    </div>
  );
}
