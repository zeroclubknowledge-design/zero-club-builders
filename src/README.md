# Zero Club Source Layout

This source tree follows the Zero Club folder organization standard.

- `routes`: TanStack Router route entry files. Keep these as thin as possible.
- `app`: app-level routing notes and framework wiring.
- `components`: reusable presentational UI and design-system components.
- `features`: product-area implementation grouped by Zero Club domain.
- `services`: API clients, Supabase integrations, storage, auth, and other external services.
- `hooks`: reusable hooks that are not owned by one feature.
- `store`: global client state.
- `utils`: pure reusable helpers.
- `types`: shared TypeScript contracts and DTOs.
- `tests`: shared unit, integration, and end-to-end tests.

When touching a large route file, move reusable UI and logic into the matching `features/*` package and keep the route as the screen entry point.
