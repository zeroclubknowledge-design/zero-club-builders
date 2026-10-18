# Certificate studio rollout

Run the entire `supabase/migrations/20261018130000_certificate_design_studio.sql` before deploying the app. It requires the existing bootcamp certificate tables/public verification function and membership lifecycle functions. The historical bootcamp-upgrade file is a record of previously applied SQL; do not rerun it.

The migration adds the certificate design defaults table, bootcamp design settings, immutable issuance snapshots, the public verification wrapper, and a public certificate-assets bucket. Signature and logo files are intentionally visible on issued certificates. Authenticated users cannot overwrite or delete these immutable files, including through older broad storage policies.

New bootcamps with certification enabled require a selected template, signatory name and uploaded PNG signature. Existing bootcamps and already-issued certificates retain their previous behavior until the creator selects a new design. The existing issuance RPC continues to decide who is eligible for a certificate; a database trigger captures the design at issuance. Changing a bootcamp's design does not alter earlier certificates. Revocation still uses the existing process.

All Tutor and Institution accounts can use Zero Club templates. Own-brand certificates require an Institution account, Tutor Pro, Tutor Max or platform-admin access. Both the page and database validate entitlement. Signatures can be drawn on a transparent canvas or uploaded as transparent PNG files; the image upload path bypasses normal cover-image compression to preserve transparency.

Templates include original front/back vector artwork inspired by the supplied visual references. Public verification supports viewing either side and printing both sides as two A4 landscape pages through Save as PDF. Print at 100%, with browser headers and footers disabled; enable background graphics when the browser offers that option.

Zero Form preview videos autoplay and loop muted. A persistent Sound on/off control enables audio with one tap, as browsers generally block automatic audio before user interaction.

Validation: `node --test scripts/certificate-studio.test.mjs`, TypeScript, production build, and browser checks with simulated accounts. After deployment, verify a real Tutor Pro and Institution account, a new bootcamp, an issued certificate's two PDF pages, a legacy certificate, revocation and Zero Form video playback.
