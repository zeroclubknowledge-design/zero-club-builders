# App Entry Points

TanStack Router requires route files to remain in `src/routes`, so the route files stay there as framework entry points.

New implementation code should live inside the matching `src/features/*` domain. Routes should become thin screens that compose feature components, call feature hooks, and pass data into reusable UI.

Use this folder for app-level documentation, route conventions, and framework wiring that does not belong to a single product feature.
