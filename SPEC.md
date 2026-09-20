# Frogbot V3 Customer Demo — Specification

Agent-ready specification for evolving this repository into a customer-facing **awareness / entrypoint** demo of JFrog Frogbot V3. Target coverage is roughly **80%** of a typical first conversation — not a kitchen-sink feature tour.

**Platform target:** `tomjpd` (JFrog SaaS — `https://tomjpd.jfrog.io`).  
**Source app:** existing npm project in this repo (do not add other package ecosystems).  
**Action version:** pin `jfrog/frogbot@v3` everywhere (ignore older docs that still show `@v2`).

**Critical npm resolution constraint:** Dependencies and `package-lock.json` **must** resolve through **`tomjpd`** (`npm-remote` via `jf npm`). Corporate Package Traffic Controller (JFrog Curation) sends unmanaged npm traffic to `jfrogrepo24`, which will poison SCA results for this demo. Never regenerate the lockfile with bare `npm install` on a PTC-managed workstation.

**Known Platform issue:** repo scans that hang after `Xray is processing your scan results...` are documented in [ISSUES.md](ISSUES.md) (Watch / violations wait vs Xray indexing stall on `tomjpd`).

---

## 1. Goal and audience

### Goal

Demonstrate that Frogbot shifts security left in GitHub by:

1. Blocking risky pull requests with SCA findings.
2. Opening aggregated autofix PRs from full repository scans.
3. Showing **Contextual Analysis** (applicable vs not applicable).
4. Surfacing scan results and **SBOM** in the JFrog Platform Scans List.
5. Detecting a planted OSS **code snippet** and an **inactive/fake secret** with **dynamic token validation**.
6. Authenticating to the JFrog Platform with **OIDC** (no long-lived `JF_ACCESS_TOKEN` in GitHub secrets).

### Audience

Pre-sales / SE live demos for customers evaluating Frogbot, Xray, and JFrog Advanced Security (JAS) on GitHub Actions.

### Non-goals (this demo)

- Multi-language or multi-package-manager showcase.
- Live demo of Platform Config Profiles as a primary moment (optional verbal talking point only).
- Deep SAST / IaC walkthrough as primary moments (JAS remains enabled so Secrets, Contextual Analysis, and related scanners run).
- JFrog GitHub App automatic integration as the setup path (use **manual** workflows; App integration is org-only).
- Deep Dependency Graph walkthrough (Code Scanning setup is documented in [§8](#8-github-code-scanning--security-tab) when GHAS is available).

---

## 2. Success criteria (customer moments)

Each moment is **done** only when the listed observable outcome is true in a live run.

| ID | Moment | Acceptance criteria |
| --- | --- | --- |
| M1 | PR blocks a bad SCA change | Opening a PR that introduces or retains a Medium+ vulnerable dependency causes Frogbot to post a PR comment with new findings and **fail** the PR check (`JF_FAIL` / `failOnSecurityIssues`). Comment shows CVE/severity/component/fix version where available. |
| M2 | Autofix from repo scan | Manual or scheduled repository scan opens **one aggregated** fix PR upgrading vulnerable dependencies (`aggregateFixes` / `JF_GIT_AGGREGATE_FIXES`). Autofix must **not** be expected from PR scans. |
| M3 | Contextual Analysis | At least one finding shows **applicable** (reachable use in app code) and at least one related finding shows **not applicable** (or equivalent status) in PR decoration and/or Platform scan detail. |
| M4 | SBOM in Platform Scans List | After a repository (commit) scan, `Application > Xray > Scans List > Git Repositories` shows this repo; commit detail includes **Security Issues** and **SBOM** (component inventory / transitive visibility as available on the instance). |
| M5 | Snippet + inactive secret validation | Repo (and/or PR) scan detects (a) planted OSS snippet and (b) planted inactive/fake secret; secret shows **dynamic token validation** status as inactive/invalid/not active in Platform (and in PR comments only if secrets PR comments are enabled). |
| M6 | OIDC auth | Both workflows authenticate with `oidc-provider-name` + `permissions.id-token: write`. Repo secrets must **not** contain `JF_ACCESS_TOKEN`. `JF_URL` may be a GitHub Actions **variable**. Scans succeed end-to-end with OIDC-issued tokens. |

---

## 3. Architecture

```text
Developer / SE
    │
    ├─ opens PR ──────────────► GitHub Actions: frogbot-scan-pr.yml
    │                              │  pull_request_target
    │                              │  jfrog/frogbot@v3 (scan-pull-request)
    │                              │  OIDC → short-lived JFrog token
    │                              └─► PR comment + fail check (diff-only issues)
    │
    └─ runs / schedule ───────► GitHub Actions: frogbot-scan-repo.yml
                                   │  workflow_dispatch + cron (+ optional push)
                                   │  jfrog/frogbot@v3 (scan-repository)
                                   │  OIDC → short-lived JFrog token
                                   ├─► aggregated autofix PR (if fixable)
                                   └─► JFrog Platform
                                          Application > Xray > Scans List
                                          Git Repositories → Commits / PRs
                                          Security Issues + SBOM (CDX)
```

**Config precedence (highest wins):** environment variables in the workflow → Platform Frogbot configuration → defaults. Local `.frogbot/frogbot-config.yml` on the **target branch** is used when present; a file added only on a PR source branch is ignored until merged.

**Scan behavior (PR):** checkout/scan target branch → checkout/scan source branch → report **only new** issues → decorate PR.

**Scan behavior (repo/commit):** scan latest commit on configured branch → upload results to Platform → optionally open autofix PR(s).

---

## 4. Prerequisites and configuration

Implementer must ensure the following exist before demo day. Document values in README (never commit secrets).

### 4.1 JFrog Platform (`tomjpd`)

1. **Xray** version ≥ `3.143.6` (Frogbot V3 requirement) on **`tomjpd`**.
2. **JFrog Advanced Security** entitlement enabled (Contextual Analysis, Secrets, dynamic token validation, snippet detection as licensed).
3. **Frogbot results repository** created (initial admin setup). Runtime identity needs **Deploy** (and standard read) on that repository plus access needed to resolve/scan.
4. **OIDC integration**
   - Administration → Manage Integrations → OpenID Connect.
   - Provider Name: e.g. `frogbot-demo` (must match workflow `oidc-provider-name`).
   - Identity mapping claims JSON scoped to this GitHub repo, e.g. `{ "repository": "<owner>/<repo>" }`.
   - Token scope/permissions sufficient for Xray + JAS + Frogbot SBOM deploy.
   - Raise **token expiration** on the identity mapping if long scans fail mid-run.
5. **Watch + policy**
   - Security policy that flags High/Critical (and ideally Medium) CVEs.
   - Watch (e.g. `frogbot-v3-watch`) targeting this Git repository / indexed resource.
6. **Scanners (Platform and/or local config)**
   - SCA: enabled.
   - Contextual Analysis: enabled.
   - Secrets: enabled; **dynamic token validation** enabled.
   - Snippet detection: enabled at repo/Platform level if exposed in UI for this instance.
   - SAST/IaC: may remain enabled; not primary demo moments.
7. **npm resolve path:** Artifactory repo key **`npm-remote`** on `tomjpd`, bound in `.jfrog/projects/npm.yaml` via `jf npm-config`.
8. Optional talking point only: centralized Frogbot Configuration under `Administration > Xray Settings > Indexed Resources > Git Repositories` (server/folder/repo inheritance). Live demo still uses repo workflows + `.frogbot/frogbot-config.yml`.

### 4.2 GitHub repository

1. Actions → General (**Settings → Actions → General → Workflow permissions**):
   - Workflow permissions: **Read and write** *or* keep **Read repository contents and packages permissions** if each workflow declares its own `permissions:` block (this lab does).
   - **Allow GitHub Actions to create and approve pull requests**: **must be enabled**. Without this, Frogbot pushes `frogbot-*` fix branches successfully but every `POST .../pulls` fails with `403 GitHub Actions is not permitted to create or approve pull requests`, leaving orphaned branches and **zero autofix PRs**.
2. Variables / secrets:
   - `JF_URL` → Actions **variable** (`https://tomjpd.jfrog.io`).
   - **Do not** set `JF_ACCESS_TOKEN` once OIDC works.
   - `JF_GIT_TOKEN` → use `${{ secrets.GITHUB_TOKEN }}` in workflows (sufficient for same-repo PR comments/autofix with granted permissions).
3. If the repo is **public** and uses `pull_request_target`: keep Environment named `frogbot` with required reviewers on the PR scan job (prevents forked-PR token leakage). Private repos may omit the environment if not required.
4. **GitHub Code Scanning** (Security tab) — required if you want Frogbot SARIF in **Security → Code scanning**. See [§8](#8-github-code-scanning--security-tab). Not required for Platform Scans List (M4).

### 4.3 npm / runner prerequisites

- Node.js + npm available on `ubuntu-latest` (default).
- Commit a valid **`package-lock.json`** whose `resolved` URLs are **`https://tomjpd.jfrog.io/artifactory/api/npm/npm-remote/...`** (not `jfrogrepo24`, not `registry.npmjs.org`).
- Regenerate lockfile only via JFrog CLI against the demo JPD:

```bash
jf npm-config --server-id-resolve=tomjpd --repo-resolve=npm-remote
rm -rf node_modules package-lock.json
jf npm install
```

- `installCommand: "jf npm install"` in `frogbot-config.yml` so CI installs also resolve through Artifactory once Frogbot/OIDC has configured `jf` on the runner.
- Project binding lives at `.jfrog/projects/npm.yaml` (`serverId: tomjpd`, `repo: npm-remote`).

---

## 5. Required repository changes

Evolve the existing lab; do not rewrite as a new project.

### 5.1 Workflows — OIDC

Update both:

- `.github/workflows/frogbot-scan-pr.yml`
- `.github/workflows/frogbot-scan-repo.yml`

**Required pattern:**

```yaml
permissions:
  pull-requests: write
  contents: read   # write for repo-scan workflow
  id-token: write  # mandatory for OIDC
  security-events: write  # mandatory for Code Scanning SARIF upload (see §8)

jobs:
  # ...
  steps:
    - uses: jfrog/frogbot@v3
      env:
        JF_URL: ${{ vars.JF_URL }}
        JF_GIT_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        # PR scan extras:
        # JF_FAIL: "TRUE"
        # JF_MIN_SEVERITY: "Medium"
        # JF_INCLUDE_ALL_VULNERABILITIES: "FALSE"
        # Repo scan extras:
        # JF_GIT_BASE_BRANCH: ${{ matrix.branch }}
        # JF_GIT_AGGREGATE_FIXES: "TRUE"
        # JF_FIXABLE_ONLY: "TRUE"   # prefer true for cleaner autofix demo
      with:
        oidc-provider-name: frogbot-demo   # must match Platform Provider Name
```

**Remove** `JF_ACCESS_TOKEN` from both workflows once OIDC is verified.

**PR workflow:** keep `pull_request_target` + `environment: frogbot` for public repos. Prefer checking out the PR head SHA when required by current Frogbot GitHub docs.

**Repo workflow:** keep `workflow_dispatch` and daily `schedule`; optional `push` to `main` is allowed. Keep `JF_GIT_AGGREGATE_FIXES: "TRUE"`.

**Code Scanning:** grant `security-events: write` on both workflows (see §8). Optional env vars `JF_UPLOAD_SBOM_TO_VCS` / `JF_UPLOAD_PR_SECURITY_RESULTS_TO_VCS` control Dependency Graph / PR SARIF publish when GHAS is available.

### 5.2 `.frogbot/frogbot-config.yml`

Keep file at `.frogbot/frogbot-config.yml` on `main`. Align with moments:

| Setting | Required value / guidance |
| --- | --- |
| `git.repoName` | Match GitHub repo name |
| `git.branches` | `[main]` |
| `git.aggregateFixes` | `true` |
| `scan.failOnSecurityIssues` | `true` |
| `scan.minSeverity` | `Medium` (or `High` if noise is too high) |
| `scan.fixableOnly` | Prefer `true` for autofix cleanliness in M2 |
| `scan.disableJas` | `false` |
| `scan.projects[0].workingDirs` | `["."]` |
| `scan.projects[0].installCommand` | **`jf npm install`** (must use Artifactory / `tomjpd`, not bare npm) |
| `jfrogPlatform.watches` | Match Platform watch name |

Ensure the config exists on the **target** branch before relying on it for PR scans.

### 5.3 Sample application / findings plants

**Keep** vulnerable direct deps in `package.json` (current set is fine: lodash, express, minimist, axios, moment, handlebars — adjust only if CVEs go stale).

**Add** and commit `package-lock.json` generated with **`jf npm install`** against `tomjpd` / `npm-remote` (see §4.3). Verify every `resolved` URL hosts on `tomjpd.jfrog.io`.

**`index.js` (or small dedicated files under `src/` / `demo-plants/`):**

1. **Contextual Analysis — applicable:** keep reachable vulnerable APIs (e.g. `_.merge`, `_.template`, Handlebars `compile`, Moment parsing) used by HTTP routes.
2. **Contextual Analysis — not applicable:** include at least one vulnerable dependency that is **declared but not called** (or only referenced in a way Contextual Analysis marks not applicable). Document which package is the “not applicable” contrast in README.
3. **Snippet detection:** plant a recognizable open-source function body copied into first-party source **without** adding that project as a dependency. Comment the plant clearly, e.g. `// DEMO: intentional OSS snippet for Frogbot snippet detection`.
4. **Inactive/fake secret:** plant a secret-shaped string that Secrets detection will match but **dynamic token validation** will report as inactive/invalid. Requirements:
   - Must look like a real token pattern (e.g. GitHub PAT-shaped `ghp_` + non-functional suffix).
   - Must **not** be a live credential.
   - Label clearly in code comments as demo-only.
   - Prefer a dedicated file such as `demo-plants/fake-secrets.js` excluded from runtime paths if needed, but still scanned.

### 5.4 README

Rewrite README around the six moments:

1. Platform + GitHub + OIDC prep.
2. Flow A — PR SCA gate (M1 + M3 as visible on the PR).
3. Flow B — repo scan autofix (M2).
4. Flow C — Platform Scans List + SBOM (M4).
5. Flow D — snippet + secret validation in Platform (M5).
6. Note that auth is OIDC (M6) and there is no `JF_ACCESS_TOKEN` secret.
7. Short pointer to §8 for GHAS if available.
8. Link to this `SPEC.md` and the Reference documentation section.

---

## 6. Demo script (suggested order)

Total live time target: **15–25 minutes**. Full SE playbook (prep, click paths, talking points, pitfalls): [DEMO_GUIDE.md](DEMO_GUIDE.md).

### Prep (before customer joins)

1. Confirm OIDC workflow runs green on `main` (repo scan).
2. Confirm Watch/policy and JAS scanners are on.
3. Close or merge any leftover Frogbot autofix PRs so M2 is dramatic.
4. Have Platform Scans List filtered to this Git repo.

### Live

1. **M6 (30s):** Show workflow YAML: `oidc-provider-name`, `id-token: write`, no `JF_ACCESS_TOKEN` in repo secrets; only `JF_URL` variable.
2. **M1:** Branch → bump or reintroduce a vulnerable dep → open PR → show Frogbot comment + failed check (diff-only).
3. **M3:** On the same PR or Platform detail, call out applicable vs not applicable Contextual Analysis status.
4. **M2:** Run **Frogbot Scan Repository** via `workflow_dispatch` → show aggregated autofix PR.
5. **M4:** In Platform: Scans List → Git Repositories → this repo → latest commit → Security Issues + SBOM / transitive view.
6. **M5:** In Platform (and PR if secrets comments enabled): show snippet finding + secret finding with validation **inactive/invalid**.
7. **Close:** Optional one-liner on centralized Config Profiles and IDE scanning as adjacent products — not demonstrated.

### Reset between demos

- Revert demo PR branches.
- Close autofix PRs or reset `package.json` / lockfile to the vulnerable baseline on `main`.
- Keep secret/snippet plants on `main` so M5 remains reproducible without re-planting.

---

## 7. Talking points (short)

- **PR scan vs repo scan:** PR = “what did this change introduce?”; repo scan = “what is already in the branch?” + autofix.
- **V3 static SCA:** more reliable without depending on a green build; still commit `package-lock.json` for npm accuracy.
- **Contextual Analysis:** reduces noise — fix what is reachable first.
- **OIDC:** no long-lived Platform token in GitHub; identity mapping scopes which repo/workflow can mint tokens.
- **Platform as system of record:** Scans List unifies Git findings next to binary scanning stories elsewhere in the JFrog pitch.
- **Secrets validation:** finding a string is not enough — validation shows whether it is still live (this demo uses a deliberately inactive token).

---

## 8. GitHub Code Scanning / Security tab

Frogbot can publish scan results into GitHub’s **Security → Code scanning** list (SARIF). Without the steps below, the Action log shows a non-fatal warning and nothing appears in the Security tab:

```text
upload code scanning for main branch failed with:
POST https://api.github.com/repos/<owner>/<repo>/code-scanning/sarifs:
403 Resource not accessible by integration []
```

### Required configuration (verified on this lab)

| # | Where | What |
| --- | --- | --- |
| 1 | Both workflow YAML files | Add `security-events: write` under top-level `permissions:` |
| 2 | Repo **Settings → Actions → General → Workflow permissions** | Enable **Allow GitHub Actions to create and approve pull requests** (needed for autofix PRs; see §4.2) |
| 3 | GitHub Advanced Security | Code scanning must be available on the org/repo (public repos usually have it; private repos need GHAS entitlement) |

**Workflow snippet (both `frogbot-scan-repo.yml` and `frogbot-scan-pr.yml`):**

```yaml
permissions:
  contents: write          # write on repo-scan; read is enough on PR-scan
  pull-requests: write
  id-token: write
  security-events: write   # <-- required for SARIF → Code Scanning
```

After a green **Frogbot Scan Repository** run, confirm:

- Action log has **no** `403 Resource not accessible by integration` for `code-scanning/sarifs`.
- **Security → Code scanning alerts** lists findings (SCA / SAST / Secrets tools as present). Dependency Graph upload may still succeed independently (`Successfully uploaded snapshot to dependency graph, status: 201`).

### Optional env vars (Dependency Graph / PR SARIF)

When GHAS + JAS are available and you want SBOM publish into GitHub Dependency Graph or PR findings as Code Scanning alerts:

```yaml
env:
  JF_UPLOAD_SBOM_TO_VCS: "TRUE"                    # often default true
  JF_UPLOAD_PR_SECURITY_RESULTS_TO_VCS: "TRUE"     # PR findings → Code Scanning
```

### Recovery if autofix PRs never appear

Symptom: Action log shows `Creating Pull Request from: frogbot-<pkg>-…` then `403 GitHub Actions is not permitted to create or approve pull requests`, or `Skipping fix pull request … a fix branch already exists`.

1. Enable **Allow GitHub Actions to create and approve pull requests** (§4.2 / row 2 above). Via API: `PUT /repos/{owner}/{repo}/actions/permissions/workflow` with `can_approve_pull_request_reviews=true`.
2. Delete orphaned `frogbot-*` fix branches (Frogbot will not open a new PR while the branch exists).
3. Re-run **Frogbot Scan Repository**.

### Notes

- Keep **JFrog Platform Scans List** as the primary SBOM / Security Issues narrative (M4). GitHub Code Scanning is developer-native secondary visibility.
- Moments M1–M6 in §2 do **not** require Code Scanning to pass acceptance; enable it when the org supports it.
- See [ISSUES.md](ISSUES.md) for the separate Platform watch / violations hang that is unrelated to Code Scanning.

---

## 9. Non-goals and known limits

- Snippet detection is called out on Frogbot V3 overview; deep public parameter docs in the crawled set are thin — enable in Platform/JAS and verify empirically; if the instance lacks snippet detection, document the gap and keep the plant for when entitlement exists.
- Dynamic token validation coverage depends on which token providers JAS supports; choose a fake pattern known to be validated (e.g. GitHub-shaped) even if inactive.
- Autofix only runs on repository/commit scans, never as the outcome of a PR scan.
- `frogbot-config.yml` must be on the **target** branch to affect PR scans.
- Do not set both `JF_ACCESS_TOKEN` and `JF_USER`/`JF_PASSWORD` together.
- For debug: `JFROG_CLI_LOG_LEVEL=DEBUG`.
- Some documentation pages still show `jfrog/frogbot@v2` examples — this demo standardizes on **`@v3`**.

---

## 10. Implementation checklist (for the implementing agent)

- [ ] Convert both workflows to OIDC; remove `JF_ACCESS_TOKEN`; pin `@v3`.
- [ ] Ensure `package-lock.json` is generated via `jf npm` against `tomjpd` and committed (resolved URLs on `tomjpd.jfrog.io`).
- [ ] Align `.frogbot/frogbot-config.yml` with §5.2 (`installCommand: jf npm install`).
- [ ] Plant applicable vs not-applicable Contextual Analysis contrast in sample code.
- [ ] Plant OSS snippet (comment-labeled) for snippet detection.
- [ ] Plant inactive/fake secret (comment-labeled) for Secrets + dynamic validation.
- [ ] Rewrite README for the six moments + reset notes + PTC/lockfile warning.
- [ ] Grant `security-events: write` on both workflows; enable Actions “create and approve pull requests”; verify Code Scanning alerts after a repo scan (§8).
- [ ] If autofix PRs fail with 403 or orphaned `frogbot-*` branches, follow §8 recovery steps.
- [ ] Verify M1–M6 against §2 on **`tomjpd`** before calling the demo complete.
- [ ] If repo scan hangs on `Xray is processing your scan results...`, see [ISSUES.md](ISSUES.md).

---

## 11. Reference documentation

Implementing agents should consult these pages (authoritative product behavior). Prefer `@v3` examples on the GitHub integration pages when docs conflict with older `@v2` snippets.

### Overview

- https://docs.jfrog.com/security/docs/frogbot
- https://docs.jfrog.com/security/docs/frogbot-v2

### Capabilities and prerequisites

- https://docs.jfrog.com/security/docs/supported-technologies-source-code
- https://docs.jfrog.com/security/docs/package-manager-prerequisites
- https://docs.jfrog.com/security/docs/features-and-capabilities-source-code

### GitHub / Actions setup

- https://docs.jfrog.com/security/docs/github
- https://docs.jfrog.com/security/docs/github-actions
- https://docs.jfrog.com/security/docs/installation
- https://docs.jfrog.com/security/docs/integrate-frogbot-with-the-jfrog-github-app

### Configuration

- https://docs.jfrog.com/security/docs/configure-frogbot
- https://docs.jfrog.com/security/docs/the-frogbot-config-yml-file-structure
- https://docs.jfrog.com/security/docs/frogbot-optional-configuration-parameters
- https://docs.jfrog.com/security/docs/advanced-management-and-configuration
- https://docs.jfrog.com/security/docs/how-to-commit-scan-and-pr-scan
- https://docs.jfrog.com/security/docs/troubleshooting

### Platform results and GitHub security UI

- https://docs.jfrog.com/security/docs/jfrog-platform
- https://docs.jfrog.com/security/docs/github-advnaced-security
- https://docs.jfrog.com/security/docs/github-1
