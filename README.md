# Frogbot v3 Lab

Customer-facing **awareness / entrypoint** demo of [Frogbot V3](https://docs.jfrog.com/security/docs/frogbot) on GitHub Actions + **`tomjpd`**.

Built from [SPEC.md](SPEC.md). Live SE walkthrough: [DEMO_GUIDE.md](DEMO_GUIDE.md). Six live moments (M1–M6); Code Scanning setup in [SPEC.md §8](SPEC.md#8-github-code-scanning--security-tab).

The `package.json` pins known-vulnerable versions of `lodash`, `express`, `minimist`, `axios`, `moment`, and `handlebars`. **`package-lock.json` must be generated via `jf npm` against `tomjpd`** (see below) so SCA does not resolve through the corporate Package Traffic Controller / `jfrogrepo24`.

## Moments

| ID | Moment | Where you see it |
| --- | --- | --- |
| M1 | PR blocks a bad SCA change | PR comment + failed check |
| M2 | Aggregated autofix PR | Repo scan → Frogbot fix PR |
| M3 | Contextual Analysis applicable vs not | PR decoration / Platform scan detail |
| M4 | SBOM in Platform Scans List | `Application > Xray > Scans List > Git Repositories` |
| M5 | Snippet + inactive secret validation | Platform (and PR if secrets comments enabled) |
| M6 | OIDC (no long-lived token) | Workflows + GitHub variables (no `JF_ACCESS_TOKEN`) |

**Contextual Analysis contrast:** lodash / moment / handlebars are **used** in `index.js` (applicable). `axios` and `minimist` are **declared but never required** (not applicable).

**Demo plants:** `demo-plants/oss-snippet.js` (copied `ms` logic, not a dependency) and `demo-plants/fake-secrets.js` (inactive `ghp_…` token).

---

## 1. JFrog Platform prep (`tomjpd`)

1. Xray ≥ `3.143.6` and **JFrog Advanced Security** entitlement on **`tomjpd`** (`https://tomjpd.jfrog.io`).
2. Frogbot results repository created; OIDC identity can **Deploy** to it.
3. **OIDC integration**
   - Administration → Manage Integrations → OpenID Connect.
   - Provider Name: `frogbot-demo` (must match workflows).
   - Identity mapping claims, e.g. `{ "repository": "<owner>/frogbot-v3" }`.
   - Token scope for Xray + JAS + Frogbot SBOM deploy; raise TTL if scans expire mid-run.
4. **Watch** `frogbot-v3-watch` bound to a security policy (High/Critical, ideally Medium+).
5. Enable scanners: SCA, Contextual Analysis, Secrets + **dynamic token validation**, snippet detection (if available).
6. npm resolve repo: Artifactory **`npm-remote`** (see `.jfrog/projects/npm.yaml`).
7. (Optional) Centralized Frogbot config under Indexed Resources → Git Repositories — talking point only; this lab uses `.frogbot/frogbot-config.yml`.

### Regenerating `package-lock.json` (required when deps change)

Corporate Package Traffic Controller sends unmanaged npm traffic to `jfrogrepo24`, which breaks this demo’s SCA story. Always resolve through **`tomjpd`**:

```bash
# JF CLI server-id tomjpd must already exist (jf c show)
jf npm-config --server-id-resolve=tomjpd --repo-resolve=npm-remote
rm -rf node_modules package-lock.json
jf npm install
# Confirm resolved URLs:
grep -o 'https://[^"]+' package-lock.json | sort -u | head
# Expect: https://tomjpd.jfrog.io/artifactory/api/npm/npm-remote/...
```

Do **not** regenerate the lockfile with bare `npm install` on a PTC-managed machine.

## 2. GitHub repo prep

1. Push this repo to GitHub.
2. Actions → General: **Read and write** workflow permissions; enable **Allow GitHub Actions to create and approve pull requests**.
3. Actions variables:
   - `JF_URL` → `https://tomjpd.jfrog.io`
4. **Do not** set `JF_ACCESS_TOKEN` (OIDC supplies the token).
5. Public repos using `pull_request_target`: create Environment **`frogbot`** with a required reviewer; attach it to the PR scan job (already set).

---

## 3. Demo flows

### Flow A — M1 + M3 (PR SCA gate + Contextual Analysis)

```bash
git checkout -b bump-lodash
# edit package.json lodash to another vulnerable pin, e.g. 4.17.20, or leave 4.17.4 and add a new vulnerable dep
git add package.json package-lock.json && git commit -m "bump lodash" && git push -u origin bump-lodash
gh pr create --fill
```

Expected: Frogbot comments with **new** issues and fails the check. Call out applicable (lodash/moment/handlebars) vs not applicable (axios/minimist) Contextual Analysis status.

### Flow B — M2 (aggregated autofix)

```bash
gh workflow run "Frogbot Scan Repository"
```

Expected: one aggregated fix PR upgrading vulnerable deps (`aggregateFixes` / `JF_GIT_AGGREGATE_FIXES`).

### Flow C — M4 (Platform SBOM)

After the repo scan: **Application → Xray → Scans List → Git Repositories** → this repo → latest commit → **Security Issues** + **SBOM**.

### Flow D — M5 (snippet + secret validation)

In the same Platform commit/PR detail: snippet finding from `demo-plants/oss-snippet.js` and secret finding from `demo-plants/fake-secrets.js` with validation **inactive / invalid / not active**.

### M6 (OIDC) — show anytime

Open either workflow: `id-token: write`, `oidc-provider-name: frogbot-demo`, `JF_URL` from `vars`, **no** `JF_ACCESS_TOKEN`. Confirm repo secrets do not contain a Platform token.

### Reset between demos

- Close/merge leftover Frogbot autofix PRs and demo branches.
- Keep vulnerable baseline + plants on `main` so M2/M5 stay reproducible.

---

## 4. Files

| Path | Purpose |
| --- | --- |
| `.github/workflows/frogbot-scan-pr.yml` | PR scan (OIDC); comments + fails on new vulns |
| `.github/workflows/frogbot-scan-repo.yml` | Repo scan (OIDC); autofix PR; results → Platform |
| `.frogbot/frogbot-config.yml` | Aggregate fixes, JAS on, watch, `jf npm install` |
| `.jfrog/projects/npm.yaml` | Binds `jf npm` to `tomjpd` / `npm-remote` |
| `package.json` / `package-lock.json` | Vulnerable npm target (lockfile resolved via tomjpd) |
| `index.js` | Reachable vulnerable call sites + plant requires |
| `demo-plants/oss-snippet.js` | OSS snippet plant (M5) |
| `demo-plants/fake-secrets.js` | Inactive fake secret (M5) |
| `SPEC.md` | Full specification + docs links |
| `DEMO_GUIDE.md` | SE live demo walkthrough (setup + each moment) |
| `ISSUES.md` | Known Platform / Watch hang + workarounds |

---

## 5. Talking points

- **PR vs repo scan** — PR = what this change introduced; repo scan = what is already on the branch + autofix.
- **V3 static SCA** — less dependent on a green build; still commit `package-lock.json` for npm accuracy.
- **Contextual Analysis** — prioritize reachable issues; unused vulnerable deps are noise.
- **OIDC** — no long-lived Platform token in GitHub; identity mapping scopes which repo can mint tokens.
- **Platform as system of record** — Scans List holds Security Issues + SBOM for Git repos.
- **Secrets validation** — detection plus “is it still live?”; this lab uses a deliberately inactive token.

---

## 6. GitHub Code Scanning / Security tab

Required so Frogbot SARIF appears under **Security → Code scanning**:

1. Add `security-events: write` under `permissions:` on **both** workflows.
2. Repo **Settings → Actions → General**: enable **Allow GitHub Actions to create and approve pull requests** (also required for autofix PRs).
3. After a green repo scan, confirm Code scanning alerts and no `403 Resource not accessible by integration` in the Action log.

Optional: `JF_UPLOAD_SBOM_TO_VCS` / `JF_UPLOAD_PR_SECURITY_RESULTS_TO_VCS` for Dependency Graph / PR SARIF. Full steps: [SPEC.md §8](SPEC.md#8-github-code-scanning--security-tab).

Known Platform issue (repo scan hang / Watch violations): see [ISSUES.md](ISSUES.md).

---

## 7. Docs

See [SPEC.md §11](SPEC.md#11-reference-documentation) for the full Frogbot documentation URL list used to build this lab. Operational issues (Xray indexing hang, Watch workaround): [ISSUES.md](ISSUES.md).
