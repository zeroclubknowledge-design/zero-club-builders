# Assigning several bootcamp tutors

Deployment order:

1. Apply `supabase/migrations/20261028120000_multiple_bootcamp_tutors.sql` in the shared Supabase project.
2. Deploy the main Zero Club app. Its tutor queries now use `assigned_tutor_ids`, so install the database update first.

The migration keeps existing assignments, maintains `assigned_tutor_id` as the
primary tutor for older clients, and adds the full list in `assigned_tutor_ids`.
`set_bootcamp_tutors` saves the complete selection atomically. Only the bootcamp
creator can assign tutors, and selected tutors must belong to their organization.

Every assigned tutor appears in their studio and teaching metrics. Tutor
assignments are excluded from learner counts. Teaching access covers the whole
team; editing the bootcamp row remains creator-only, regardless of club roles.

Club access is synchronized for clubs linked by `bootcamp_id` and owned by the
bootcamp creator. The private access ledger remembers each tutor's prior role.
Removing an assignment restores that role, or removes the membership if the
assignment created it. A role that was already Administrator remains intact.
Legacy assignments predating this ledger do not revoke unrelated old club roles.

The bootcamp card has explicit image/title links rather than a parent click
handler. Assign Tutor and the three-dot menu therefore cannot bubble into card
navigation. The menu includes Assign tutors; the drawer supports searching,
checkboxes, multiple selection, Cancel and explicit Save. Drag-to-dismiss is
disabled inside the picker because it interfered with checkbox clicks.

Verification completed with the actual card JSX and drawer in an isolated
browser preview: Assign, menu → Assign tutors, saving two tutors, cancelling an
unsaved third selection, reopening with the saved selection, mobile layout at
390px, and explicit detail-link navigation. The preview used sample data; it
did not assign any real users. Database tests separately exercise the real
migration, permissions and transactional club-role updates.

```powershell
node --test scripts/multiple-bootcamp-tutors.test.mjs
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

The live database migration has not been applied from this checkout.
