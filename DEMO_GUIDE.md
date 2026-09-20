# Frogbot V3 — Live Demo Guide

SE-facing walkthrough for this lab. Spec and acceptance criteria live in [SPEC.md](SPEC.md). Setup quirks and the Xray Watch hang are in [ISSUES.md](ISSUES.md). Short README overview: [README.md](README.md).

**Audience:** customer evaluating Frogbot + Xray + JAS on GitHub Actions.  
**Target time:** 15–25 minutes live.  
**Platform:** `https://tomjpd.jfrog.io`  
**Repo:** this GitHub repo (`frogbot-v3`), workflows pin `jfrog/frogbot@v3`.

---

## 1. What this lab is set up to prove

Frogbot shifts security left **inside the developer’s existing GitHub workflow**:

| Moment | One-line story |
| --- | --- |
| **M6** | Auth to JFrog is **OIDC** — no long-lived Platform token in GitHub secrets. |
| **M1** | A risky PR gets a Frogbot comment and a **failed check** (diff-only new issues). |
| **M3** | Contextual Analysis separates **reachable** vulns from declared-but-unused noise. |
| **M2** | A full **repo scan** opens autofix PR(s) to upgrade vulnerable dependencies. |
| **M4** | Scan results + **SBOM** land in the JFrog Platform Scans List. |
| **M5** | Planted **OSS snippet** and **inactive fake secret** show up; secret validation says not live. |

Optional secondary surface (not a §2 acceptance moment): GitHub **Security → Code scanning** after SARIF upload — see [SPEC.md §8](SPEC.md#8-github-code-scanning--security-tab).

### Architecture (keep this picture in your head)

```text
Customer opens a PR  ──►  frogbot-scan-pr.yml   (pull_request_target)
                            OIDC → JFrog token
                            Diff scan → PR comment + fail check

SE runs repo scan    ──►  frogbot-scan-repo.yml  (workflow_dispatch / push / cron)
                            OIDC → JFrog token
                            Full scan → autofix PR(s) + Platform Scans List
```

**PR scan** answers: “What did *this change* introduce?”  
**Repo scan** answers: “What’s already on the branch?” and can open fix PRs.

---

## 2. Lab inventory (what’s already planted)

| Asset | Role in the demo |
| --- | --- |
| `package.json` | Pins vulnerable: `lodash@4.17.4`, `express@4.16.0`, `minimist@1.2.0`, `axios@0.21.0`, `moment@2.18.1`, `handlebars@4.0.11` |
| `package-lock.json` | Must resolve via `tomjpd` / `npm-remote` (never bare `npm install` on a PTC machine) |
| `index.js` | **Applicable** call sites: lodash `merge`/`template`, moment parse, Handlebars `compile` |
| `axios` / `minimist` | Declared in `package.json` but **never required** → Contextual Analysis **not applicable** contrast |
| `demo-plants/oss-snippet.js` | Copied `ms` package logic (not a dependency) → snippet detection |
| `demo-plants/fake-secrets.js` | Fake `ghp_…` PAT (all zeros) → Secrets + dynamic validation **inactive** |
| `.github/workflows/frogbot-scan-pr.yml` | PR gate; `JF_FAIL: "TRUE"`; Environment `frogbot` |
| `.github/workflows/frogbot-scan-repo.yml` | Repo scan + autofix; `JF_GIT_AGGREGATE_FIXES` / `JF_FIXABLE_ONLY` |
| OIDC | `oidc-provider-name: github-oidc-integration` (must match Platform provider name) |
| Variable | `JF_URL` = `https://tomjpd.jfrog.io` (Actions **variable**, not a secret) |

---

## 3. Pre-demo checklist (before the customer joins)

Do these once the morning of the demo. Aim for a clean stage.

### Platform (`tomjpd`)

- [ ] You can log into `https://tomjpd.jfrog.io`.
- [ ] OIDC provider name matches the workflow (`github-oidc-integration`).
- [ ] JAS scanners available (Contextual Analysis, Secrets + dynamic validation; snippet if licensed).
- [ ] Open **Application → Xray → Scans List → Git Repositories** and filter/search this repo so M4 is one click away.
- [ ] **Watch / violations:** if repo scans hang on `Xray is processing your scan results...`, read [ISSUES.md](ISSUES.md). The temporary workaround detaches the git-repo Watch resource so autofix still works; policy-violation storytelling is limited until Xray indexing is healthy again.

### GitHub

- [ ] Actions variable `JF_URL` is set; **no** `JF_ACCESS_TOKEN` in secrets.
- [ ] **Settings → Actions → General:** “Allow GitHub Actions to create and approve pull requests” is **on**.
- [ ] Both workflows have `permissions.security-events: write` (Code Scanning) and `id-token: write` (OIDC).
- [ ] Public repo: Environment **`frogbot`** still has a required reviewer for PR scans.
- [ ] Close or merge leftover Frogbot autofix PRs and delete leftover `frogbot-*` branches so **M2** is dramatic.
- [ ] Confirm last **Frogbot Scan Repository** run on `main` is green (~1 minute, not ~20 minutes).

### Optional smoke (5 minutes)

```bash
gh workflow run "Frogbot Scan Repository" --ref main
gh run watch
gh pr list --state open
```

---

## 4. Suggested live order (15–25 min)

| # | Moment | Time | Primary UI |
| --- | --- | --- | --- |
| 1 | **M6** OIDC | ~30–60s | Workflow YAML + repo secrets/variables |
| 2 | **M1** PR SCA gate | ~5–7 min | New PR you open by hand |
| 3 | **M3** Contextual Analysis | ~2–3 min | Same PR comment / Platform detail |
| 4 | **M2** Autofix | ~3–5 min | Actions → repo scan → Fix PR(s) |
| 5 | **M4** Scans List + SBOM | ~3 min | JFrog Platform |
| 6 | **M5** Snippet + secret | ~2–3 min | Same Platform commit (and/or Code Scanning) |
| 7 | Close | ~1 min | Adjacent products (Config Profiles, IDE) — verbal only |

GitHub Code Scanning alerts are a nice “developer already lives here” aside after M2 or M5 if time allows.

---

## 5. Moment playbooks

### M6 — OIDC authentication

**What you prove:** CI talks to JFrog with a short-lived token minted from GitHub’s OIDC identity. No long-lived `JF_ACCESS_TOKEN` sitting in the repo.

**Show**

1. Open `.github/workflows/frogbot-scan-repo.yml` (or the PR workflow).
2. Call out:
   - `permissions.id-token: write`
   - `oidc-provider-name: github-oidc-integration`
   - `JF_URL: ${{ vars.JF_URL }}` (variable, not secret)
   - `JF_GIT_TOKEN: ${{ secrets.GITHUB_TOKEN }}` (GitHub API only)
3. GitHub → **Settings → Secrets and variables → Actions**: show `JF_URL` under Variables; confirm **no** Platform access token secret.

**Talking points**

- Identity mapping on the Platform scopes which GitHub repo/workflow can mint tokens.
- Rotate/revoke is Platform-side; developers never paste Artifactory passwords into Actions secrets for this path.

**Done when:** Customer sees the pattern and agrees there is no long-lived JFrog token in the repo.

---

### M1 — PR blocks a bad SCA change

**What you prove:** Frogbot comments on the PR with **new** findings (diff vs target) and **fails** the check so the change is visible in the PR status.

**Important:** Workflows that Frogbot itself creates with `GITHUB_TOKEN` do **not** re-trigger `pull_request_target`. For M1 you must open a PR **yourself** (hand edit + `gh pr create` or the GitHub UI).

**Prep commands**

```bash
git fetch origin && git checkout main && git pull
git checkout -b demo/bump-vulnerable-dep

# Option A — re-pin an already-vulnerable dep to a different vulnerable version
# (forces a lockfile/package.json diff Frogbot will treat as “new” vs main as needed)
# e.g. change lodash from 4.17.4 → 4.17.20 in package.json, then:
jf npm-config --server-id-resolve=tomjpd --repo-resolve=npm-remote
jf npm install
# Confirm lockfile still points at tomjpd — never bare npm install on PTC laptops

git add package.json package-lock.json
git commit -m "demo: bump vulnerable lodash"
git push -u origin HEAD
gh pr create --title "demo: bump vulnerable lodash" --body "Demo PR for Frogbot M1/M3"
```

If the repo is public, approve the **`frogbot`** Environment gate when Actions prompts.

**Show**

1. PR → **Checks** / **Conversation**: Frogbot job runs (`Frogbot Scan Pull Request`).
2. Frogbot **PR comment** with CVE / severity / component / fix version where available.
3. Failed check (`JF_FAIL: "TRUE"` on the PR workflow).

**Talking points**

- PR scan is **diff-aware**: it highlights what *this* change introduced (or newly exposed), not a dump of the whole repo every time.
- Developers stay in GitHub; security signal is on the PR they already review.

**Done when:** Comment is visible and the Frogbot check is red/failed on that PR.

**Pitfalls**

- Environment `frogbot` waiting on reviewer → approve so the job starts.
- Lockfile regenerated with bare `npm` → wrong registry / PTC → bad SCA story. Always `jf npm`.
- Opening a PR that doesn’t change dependencies may yield “no new issues” — make a deliberate vulnerable bump.

---

### M3 — Contextual Analysis (applicable vs not applicable)

**What you prove:** Not every CVE on a declared package is equally urgent. Frogbot/JAS marks reachable use as **applicable** and unused packages as **not applicable** (or equivalent).

**Where the contrast is planted**

| Status | Packages | Why |
| --- | --- | --- |
| **Applicable** | `lodash`, `moment`, `handlebars` | Called on HTTP routes in `index.js` (`_.merge`, `_.template`, `moment(...)`, `Handlebars.compile`) |
| **Not applicable** | `axios`, `minimist` | In `package.json` only — never `require`’d |

**Show**

1. On the **same PR** from M1: in the Frogbot comment or linked detail, find applicability / Contextual Analysis status.
2. Or in Platform (after a repo scan): commit/PR scan detail → security issues → applicability column/badge.
3. Optionally open `index.js` and point at the comment block that documents the contrast (lines ~10–13).

**Talking points**

- “Fix what is reachable first” — reduces noise without pretending unused deps don’t exist.
- Same scanners power IDE / Platform stories elsewhere in the JFrog pitch.

**Done when:** Customer sees at least one applicable and one not-applicable (or equivalent) finding.

---

### M2 — Autofix from repository scan

**What you prove:** A scheduled or on-demand **full branch scan** can open fix PR(s) that upgrade vulnerable dependencies. Autofix is **not** the outcome of a PR scan.

**Show**

1. Close leftover Frogbot fix PRs / delete `frogbot-*` branches if any (otherwise Frogbot skips: “a fix branch already exists”).
2. GitHub → **Actions** → **Frogbot Scan Repository** → **Run workflow** (branch `main`).
3. Watch the run (~1 min when healthy). Log should finish with fix PR creation, not hang on `Xray is processing your scan results...`.
4. Open the new Frogbot PR(s) under **Pull requests**.

**CLI alternative**

```bash
gh workflow run "Frogbot Scan Repository" --ref main
gh run watch
gh pr list --author "app/github-actions"   # or filter by title "[🐸 Frogbot]"
```

**Talking points**

- Repo scan = debt already on `main`; PR scan = change under review.
- `JF_FIXABLE_ONLY` keeps the autofix story on packages that have a fix version.
- Spec wants **one aggregated** PR (`JF_GIT_AGGREGATE_FIXES` / `aggregateFixes`). If the Platform Config Profile wins and you get **one PR per package**, still sell the moment (“Frogbot opened fix PRs”) and note aggregation is configurable — see [ISSUES.md](ISSUES.md) on V3 config profiles vs local YAML.

**Done when:** At least one Frogbot fix PR is open with a dependency bump.

**Pitfalls**

- `403 GitHub Actions is not permitted to create or approve pull requests` → enable the Actions setting in §3.
- Orphaned `frogbot-*` branches without PRs → delete branches, re-run.
- 20-minute hang after local scanners → [ISSUES.md](ISSUES.md) (Xray indexing / Watch workaround).

---

### M4 — SBOM / Security Issues in Platform Scans List

**What you prove:** Git findings are not trapped in Actions logs. The Platform is the system of record for **Security Issues** and **SBOM** on the Git repository.

**Show**

1. After a successful repo (commit) scan:  
   **Application → Xray → Scans List → Git Repositories**
2. Select this repo → latest **commit** (or PR, if shown).
3. Open **Security Issues** and **SBOM** (component inventory / transitive view as available).

**Talking points**

- Same Platform surface customers already use for binaries/builds — Git is now first-class.
- SBOM supports transitive visibility and inventory conversations without a separate tool.

**Done when:** Customer sees this repo’s commit with Security Issues and an SBOM/component list.

**Pitfalls**

- If Xray never indexes uploaded CDX artifacts, Scans List detail may be thin even though Frogbot’s local scan succeeded — [ISSUES.md](ISSUES.md).
- Don’t demote Platform for GitHub Code Scanning; treat GitHub as secondary developer UI ([SPEC.md §8](SPEC.md#8-github-code-scanning--security-tab)).

---

### M5 — Snippet detection + inactive secret validation

**What you prove:** (1) First-party copies of OSS code can be flagged even when the package isn’t a dependency. (2) Finding a secret-shaped string is not enough — **dynamic validation** shows whether it’s still live.

**Plants (already on `main`)**

| File | Expected signal |
| --- | --- |
| `demo-plants/oss-snippet.js` | Snippet / OSS copy finding (`ms`-derived logic, MIT, not installed) |
| `demo-plants/fake-secrets.js` | Secrets finding on `ghp_0000…`; validation **inactive / invalid / not active** |

**Show**

1. In Platform commit detail from M4: locate snippet and secrets findings.
2. On the secret: highlight validation status (not a live credential).
3. Optional: open the two plant files in the IDE/GitHub so the customer sees the labeled `DEMO:` comments.
4. Optional: GitHub **Security → Code scanning** if SARIF upload is enabled.

**Talking points**

- Snippet detection catches “copy-paste OSS” supply-chain / license risk.
- Inactive validation avoids panic pages on demo tokens and teaches the live-vs-dead distinction for real incidents.

**Done when:** Both plants are visible with the secret marked inactive/invalid.

**Pitfalls**

- Snippet detection depends on JAS entitlement / instance capability — if missing, show the plant and document the gap.
- Do **not** replace the fake token with a real PAT.

---

## 6. Optional: GitHub Code Scanning aside

After M2 or M5:

1. GitHub → **Security → Code scanning alerts**.
2. Filter by tools Frogbot uploaded (Xray / SAST / Secrets as present).
3. One sentence: “Same findings, where developers already look for Dependabot/CodeQL.”

Requirements and recovery: [SPEC.md §8](SPEC.md#8-github-code-scanning--security-tab).

---

## 7. Close / adjacent (verbal only)

Keep to one line each — do not demo unless asked:

- **Platform Config Profiles** — central Frogbot policy inheritance for many repos.
- **IDE scanning** — same engine closer to the keyboard.
- **Curation / PTC** — why this lab’s lockfile must resolve through `tomjpd` (corporate PTC would poison SCA).

---

## 8. Reset between demos

```bash
# Close demo + Frogbot PRs (adjust numbers)
gh pr list --state open
gh pr close <n> --comment "demo reset"

# Delete leftover fix / demo branches
gh api repos/<owner>/frogbot-v3/branches --jq '.[].name' | grep -E '^(frogbot-|demo/)' | while read b; do
  gh api -X DELETE "repos/<owner>/frogbot-v3/git/refs/heads/$b"
done

git checkout main && git pull
# Keep vulnerable package.json + demo-plants on main — do not “clean up” plants
```

Re-run a green **Frogbot Scan Repository** once if you want a fresh Scans List timestamp before the next customer.

---

## 9. Troubleshooting cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Hang after `Xray is processing your scan results...` | Xray indexing / violations wait | [ISSUES.md](ISSUES.md) |
| `403` on `code-scanning/sarifs` | Missing `security-events: write` | SPEC §8 |
| `403` creating pull requests | Actions “create and approve PRs” off | SPEC §8 / §4.2 |
| “fix branch already exists” | Orphaned `frogbot-*` branches | Delete branches, re-run |
| PR scan never runs on Frogbot’s own PRs | `GITHUB_TOKEN` doesn’t re-trigger workflows | Open M1 PR by hand |
| PR job stuck “Waiting for approval” | Environment `frogbot` | Approve deployment |
| Weird / empty SCA | Lockfile via PTC / `npmjs` | Regenerate with `jf npm` on `tomjpd` |
| YAML watch name ≠ Platform | V3 uses Config Profile + Platform watches | [ISSUES.md](ISSUES.md) §2 |

---

## 10. Quick reference links

| Resource | Path / URL |
| --- | --- |
| Spec (moments, checklist, docs) | [SPEC.md](SPEC.md) |
| Platform / Watch issues | [ISSUES.md](ISSUES.md) |
| Lab README | [README.md](README.md) |
| Platform | https://tomjpd.jfrog.io |
| Frogbot docs | https://docs.jfrog.com/security/docs/frogbot |
| GitHub Actions integration | https://docs.jfrog.com/security/docs/github-actions |
