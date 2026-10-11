# BRafaelS — dependency and asset inventory checkpoint

Date: 2026-10-11; protocol: ¿00002¿B. Repository: brasilguard-v2.

## Grounded manifest discovery
package.json and package-lock.json present; review @supabase/supabase-js and jsonwebtoken plus entire locked transitive tree.

## Required verification (not yet passed)
- [ ] Generate complete SBOM/SPDX from a clean checkout at the release commit.
- [ ] Independently verify exact licenses, provenance, conditions and notices of direct and transitive dependencies.
- [ ] Audit logos, fonts, photos, screenshots, templates, artwork and vendor datasets before distribution.
- [ ] Check source-file copyright notices and contributors; gather permission where needed.
- [ ] Confirm approved copyright holder and MIT scope.
- [ ] Separate BRafaelS brand and logos from code-license permissions; no trademark-registration claim.

State: **IP_AUDIT_PENDING**. Presence of a dependency does not mean its license is incompatible. Do not publish/merge on this checkpoint.
