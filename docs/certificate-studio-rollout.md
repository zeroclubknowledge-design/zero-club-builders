# Certificate studio rollout

Run the entire `supabase/migrations/20261018130000_certificate_design_studio.sql` before deploying the app. It requires the existing bootcamp certificate tables/public verification function and membership lifecycle functions. The historical bootcamp-upgrade file is a record of previously applied SQL; do not rerun it.

The migration adds the certificate design defaults table, bootcamp design settings, immutable issuance snapshots, the public verification wrapper, and a public certificate-assets bucket. Signature and logo files are intentionally visible on issued certificates. Authenticated users cannot overwrite or delete these immutable files, including through older broad storage policies.

New bootcamps with certification enabled require a selected template, signatory name and uploaded PNG signature. The existing issuance RPC continues to decide who is eligible for a certificate; a database trigger captures the full chosen design at issuance. Revocation still uses the existing process.

All Tutor and Institution accounts can use Zero Club templates. Own-brand certificates require an Institution account, Tutor Pro, Tutor Max or platform-admin access. Both the page and database validate entitlement. Signatures can be drawn on a transparent canvas or uploaded as transparent PNG files; the image upload path bypasses normal cover-image compression to preserve transparency.

Templates include original front/back vector artwork inspired by the supplied visual references. Public verification supports viewing either side and printing both sides as two A4 landscape pages through Save as PDF. Print at 100%, with browser headers and footers disabled; enable background graphics when the browser offers that option.

Zero Form preview videos autoplay and loop muted. A persistent Sound on/off control enables audio with one tap, as browsers generally block automatic audio before user interaction.

Validation: `node --test scripts/certificate-studio.test.mjs`, TypeScript, production build, and browser checks with simulated accounts. After deployment, verify a real Tutor Pro and Institution account, a new bootcamp, an issued certificate's two PDF pages, revocation and Zero Form video playback.

## Premium artwork edition 2

The six stable template IDs now have redesigned fronts and coordinated record
pages: engraved ivory Folio, architectural Cobalt, editorial Spectrum, sculpted
Coral, emerald marquetry Mosaic, and technical Orbit. The artwork uses vector
rules and ornaments, system serif/sans typography, proportionate logo scaling,
and full credential links. No accreditation or third-party endorsement is implied.

All six templates use the redesigned artwork. There is no archived renderer:
the platform has not issued certificates yet. The studio writes
`artwork_version: 2` and an optional `appearance` object into the complete design
JSON. The existing database stores these settings in defaults, bootcamps and
issuance snapshots; no additional SQL migration is needed for customization.

Preview, full-size view, public verification, and print use the same component.
The back includes the learner, programme note, signatory, date, actual learning
hours when present, and a credential verification panel. Uploaded signatures
have a configurable backing colour so transparent ink remains readable on dark
backgrounds.

## Appearance customization

Bootcamp creators can independently set front and back backgrounds, main and
supporting text, heading, learner name, programme title, accent, border,
decorative panel, panel text and signature backing colours. Colour pickers,
editable hex values, four coordinated presets and reset controls are provided.
Body, heading and recipient fonts can be selected independently; heading,
recipient and programme sizes and front alignment are configurable. Long names
fit automatically. Borders/panels, completion seals and paper texture can be
hidden. The heading, recipient introduction, completion statement and recognition
line can be rewritten or hidden. The existing back message, brand/logo scaling
and signature settings remain available. Actual learner identity, programme,
issue date and verification details still come from the completion record.

Both the inline and full-size editors update the same draft. These settings are
available in the certification studio and during bootcamp creation/editing.
Preview, public verification and printing all render the saved appearance.

Validation: `node --test scripts/certificate-logo-preview.test.mjs scripts/certificate-studio.test.mjs`.
Check branded wordmarks at 200%, long recipient/programme names, the six paired
compositions, front/back printing, independent backgrounds, custom fonts and
wording, decoration toggles, and reset controls on desktop and mobile.
