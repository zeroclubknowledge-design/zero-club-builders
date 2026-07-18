# Zero Club Feature Map

This folder follows the Zero Club organization standard from the product handoff document.

Each feature area owns its product screens, local state, hooks, services, and feature-specific components. Shared UI stays in `src/components`, shared API/integration logic stays in `src/services`, global state stays in `src/store`, reusable hooks stay in `src/hooks`, pure helpers stay in `src/utils`, and shared TypeScript contracts stay in `src/types`.

Current route files are still in `src/routes` because the router depends on those filenames. When a large route is edited, move the reusable pieces into the matching feature folder and leave the route as a small entry point.

## Product Areas

- `landing`: public marketing, pricing, and blog experience.
- `student`: learner dashboard, courses, lessons, quizzes, settings, profile, wallet, Zero AI, and Zero Live access.
- `tutor`: tutor studio, bootcamp creation, curriculum, students, earnings, and analytics.
- `institution`: institution studio, campus, cohorts, credentials, analytics, and partnerships.
- `community`: feed, posts, comments, likes, shares, bookmarks, stories, groups, events, messaging, media, and notifications.
- `zero-live`: live rooms, recording, transcription, attendance, and room chat.
- `zero-hub`: projects, repositories, teams, hackathons, competitions, startup hub, research, funding, and showcase.
- `zero-notes`: notes explore, bookmarks, downloads, history, reviews, comments, upload, and moderation.
- `bootcamps`: bootcamp discovery, tracks, lessons, assignments, mentors, certificates, projects, and community.
- `admin`: moderation, users, config, support, and analytics.
