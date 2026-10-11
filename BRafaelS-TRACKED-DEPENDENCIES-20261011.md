# BRafaelS — tracked third-party dependency finding (2026-10-11)

Status: **RELEASE_BLOCKER** until a clean distributable tree and notices are prepared.

Verified on `main` tree through GitHub API: **823 tracked files, 819 in `node_modules/`**, only four outside this directory: `api/verify.js`, `package.json`, `package-lock.json`, `public/index.html`. No root `.gitignore` was found. Third-party assets include Supabase Phoenix PNG files. This is a source-control hygiene and licensing/distribution risk, not evidence of infringement by itself.

Commit history authors in inspected 100-commit page: `BrasilguardLTDA`; user designated intended copyright holder `Bruno Rafael Silva Desenvolvimento de Software Ltda.`, abbreviated `BRafaelS`. A Git author string does not establish assignment to the indicated legal entity.

## Remediation
1. Prepare `.gitignore` to prevent future dependency re-introduction.
2. Produce a **separate source-only release snapshot** with dependency tree excluded, without deleting history or altering main until reviewed.
3. Preserve package-lock for reproducibility and required third-party attributions/licenses.
4. Re-audit exact source-only release snapshot and compare against running system.
5. Confirm corporate ownership and rights before issuing new MIT LICENSE.

No third-party dependencies may be claimed as BRafaelS-owned merely because present in git.