# Known issues — Frogbot V3 demo (`tomjpd`)

Working notes from debugging this lab. Share with colleagues who hit the same symptoms.

---

## 1. Repo scan hangs on “Xray is processing your scan results…”

### Symptom

`jfrog/frogbot@v3` (`scan-repository`) completes local SCA / Contextual Analysis / Secrets / IaC / SAST, then logs:

```text
Xray is processing your scan results...
```

and sits there for ~20 minutes before failing (or the job is cancelled). Earlier Action runs on this lab timed out at **exactly ~20m26s**.

INFO-level output goes silent for the whole wait. With `JF_LOG_LEVEL=DEBUG` (or `JFROG_CLI_LOG_LEVEL=DEBUG`) you would see polling messages such as waiting on **Violations Reporting**.

### What Frogbot is doing (source)

This is **not** a GitHub Actions hang. After local scanners finish, Frogbot V3 (via `jfrog-cli-security`):

1. Converts results to CycloneDX and uploads a `*.cdx.json` SBOM into Artifactory repo **`frogbot`** (hardcoded upload path for repo scans), under a path like:

   `frogbot/github.com/<owner>/<repo>/<branch>/commits/source_code_<ts>.cdx.json`

2. If the scan has a **violation context** (an active Xray Watch attached to the git repository resource, and/or watches / project key / repo path), it calls `PolicyEnforcerViolationGenerator.GenerateViolations`.

3. That path polls `POST /xray/api/v1/artifact/status` every **10 seconds** for up to **20 minutes**, waiting for the **Violations Reporting** step to reach a terminal status (`DONE` / `FAILED` / `PARTIAL` / `NOT_SUPPORTED`).

The INFO line is printed once at the start of that wait (`policy.EnrichWithGeneratedViolations`); progress is DEBUG-only.

Relevant pieces:

- Frogbot V3 → `utils.Audit` sets `SetViolationGenerator(enforcer.NewPolicyEnforcerViolationGenerator())` and `SetRtResultRepository("frogbot")`.
- `jfrog-cli-security` → `WaitForArtifactScanStatus` (`ArtifactStatusFetchingIntervalNano` = 10s, `ArtifactStatusFetchTimeoutNano` = 20m).

### Evidence on `tomjpd` (2026-07-27)

| Check | Result |
| --- | --- |
| SBOM files in Artifactory `frogbot` repo | Present (multiple uploads from hung/cancelled runs) |
| `POST /xray/api/v1/artifact/status` for those SBOMs | Stuck at `overall: PENDING`, `sca: PENDING`, `violations: NOT_SCANNED` for **50+ minutes** |
| `POST /xray/api/v1/summary/artifact` | `Artifact doesn't exist or not indexed/cached in Xray` |
| `forceReindex` on an SBOM | Accepted; status timestamp updated; still `PENDING` thereafter |
| Control: cache `lodash` via indexed `npm-remote` | Same stall — `PENDING` / not indexed |
| `POST /xray/api/v1/violations` (no filters) | `total_violations: 0` platform-wide |
| Artifactory repo `frogbot` | Exists, `xrayIndex: true`, listed in Xray indexed repos |
| Xray | `3.150.7`, `/api/v1/system/ping` → `pong`; JAS entitlements (`contextual_analysis`, `sast`, `secrets_detection`) report entitled |

**Conclusion:** Frogbot and the workflow are waiting correctly. **Xray’s artifact indexing / scan queue on `tomjpd` is not advancing** (platform-wide, not SBOM-specific). Violations Reporting never completes → Frogbot burns the full 20-minute poll timeout.

### Retest after full Platform restart (2026-07-28, ~1h uptime)

The whole `tomjpd` instance was restarted, which also moved Xray from **`3.150.7` → `3.151.3`**. The Watch’s `gitRepository` resource was restored (violations mode re-enabled) and the repo scan re-run. **The failure reproduced identically.**

| Check | Result after restart |
| --- | --- |
| Xray version | `3.151.3` (upgraded during restart), `/api/v1/system/ping` → `pong` |
| Fresh control artifact (`is-odd-3.0.1.tgz` cached via indexed `npm-remote`) | `overall: PENDING`, `sca: PENDING` — never advances |
| `summary/artifact` on that fresh artifact | `Artifact doesn't exist or not indexed/cached in Xray` |
| `forceReindex` on the old `lodash` artifact | Accepted, timestamp refreshed, still `PENDING` |
| `POST /xray/api/v1/violations` (no filters) | `total_violations: 0` platform-wide |
| Watch resource lookup (`/api/v1/xsc/watches/resource`) | `{"git_repository_watches":["Frogbot-Watch"]}` — Frogbot correctly re-enters violations mode |
| New Frogbot repo scan | SBOM uploaded to `frogbot/…/main/commits/source_code_<ts>.cdx.json`; its status: `overall: PENDING`, `violations: NOT_SCANNED`; run hangs again on `Xray is processing your scan results...` |

**Implications:**

1. **A restart / version upgrade does not fix it.** This is not a transient queue backlog or a stuck worker that a bounce clears.
2. The problem is **not** SBOM-, CycloneDX-, or Frogbot-specific — a plain npm tarball in an Xray-indexed remote shows the same permanent `PENDING`.
3. Xray *accepts* and *records* index requests (status rows with fresh timestamps) but never processes them, and no artifact on the instance has ever produced a violation. That points at the indexing/persist pipeline or its backing storage/DB on this SaaS instance rather than configuration.
4. Escalation is now stronger: include “persists across full restart and upgrade to `3.151.3`” in the Support ticket, since that rules out the usual first-line remediation.

### Temporary workaround used for the demo

Detach the **git repository** resource from the demo Watch so Frogbot no longer enters the violations-fetch path.

On this instance the Watch was named **`Frogbot-Watch`** (not the `frogbot-v3-watch` string in `.frogbot/frogbot-config.yml` — see §2 below). Before change:

```json
"project_resources": {
  "resources": [
    {
      "type": "gitRepository",
      "name": "github.com/tomjfrog/frogbot-v3.git",
      "bin_mgr_id": "default"
    }
  ]
}
```

After workaround: resource repointed to the Artifactory `frogbot` repository (Watch kept active + same security policy). Confirm:

```bash
jf xr curl -s -XGET \
  "/api/v1/xsc/watches/resource?git_repository=github.com/tomjfrog/frogbot-v3.git" \
  --server-id tomjpd
# expect: {}
```

**Important:** Setting `general_data.active: false` alone is **not** enough. The resource watches API still returned `Frogbot-Watch` while inactive; Frogbot still entered the violations wait. The git-repo resource must actually be removed/replaced.

After detach, repo scans finished in **~35–60s** and opened autofix PRs (once GitHub Actions PR permission was also fixed — see SPEC.md §8).

### Recommended root cause and durable fixes

| Priority | Action |
| --- | --- |
| 1 | **Open a JFrog Support ticket** for `tomjpd`: Xray accepts index/scan events (`PENDING` with timestamps) but never completes SCA indexing for new artifacts (generic CDX **and** npm packages in indexed remotes). Include artifact paths, `artifact/status` payloads, `forceReindex` responses, and Xray version. |
| 2 | Until Support resolves indexing, **keep the Watch’s `gitRepository` resource detached** if you need a working repo-scan / autofix demo. Document that policy-violation / `failOnSecurityIssues` against Watch rules will not show in that mode. |
| 3 | After Support / platform recovery, **restore the Watch** git-repo resource and re-verify: upload any package through an indexed remote and confirm `artifact/status` reaches `DONE` before expecting Frogbot violations mode to work. |
| 4 | Optional diagnostics while waiting: recreate the `frogbot` generic local repo (let Frogbot recreate it with Xray indexing), check SaaS health / indexing workers with Support, enable DEBUG in the workflow to confirm the poll message. |

Restore Watch (conceptually — strip `id` from a GET of the Watch, put original `gitRepository` resource back, `PUT /api/v2/watches/Frogbot-Watch`):

```json
{
  "type": "gitRepository",
  "name": "github.com/tomjfrog/frogbot-v3.git",
  "bin_mgr_id": "default",
  "filters": [
    { "type": "ant-patterns", "value": { "ExcludePatterns": [] } }
  ]
}
```

Health check before re-enabling violations mode:

```bash
# After caching a package through npm-remote:
jf xr curl -s -XPOST /api/v1/artifact/status \
  -H "Content-Type: application/json" --server-id tomjpd \
  -d '{"repo":"npm-remote-cache","path":"lodash/-/lodash-4.17.20.tgz"}'
# Want overall.status == DONE (not PENDING forever)
```

### What this is *not*

- Not missing `security-events: write` (that only affects GitHub Code Scanning SARIF — see SPEC.md §8).
- Not OIDC / `JF_URL` misconfiguration (scans and SBOM upload already succeeded before the hang).
- Not “Xray is slow on a large SBOM” alone — a single npm tarball showed the same permanent `PENDING` behavior.

---

## 2. `.frogbot/frogbot-config.yml` does not drive Frogbot V3 the way V2 docs imply

### Symptom

Workflow logs `Using Config profile 'System_Default_Profile'`. Settings in `.frogbot/frogbot-config.yml` (e.g. `jfrogPlatform.watches: frogbot-v3-watch`, `minSeverity`, `aggregateFixes`) do not match Platform behavior. The live Watch name on `tomjpd` was **`Frogbot-Watch`**, not `frogbot-v3-watch`.

### Cause

Frogbot **V3** loads a **Platform Config Profile** (and resolves watches from the git-repository resource via XSC), not the classic V2 YAML-first model. Local YAML may be ignored or only partially relevant depending on profile inheritance. Env vars in the workflow and Platform watches / policies are what actually mattered for this lab.

### Recommendation

- Treat Platform Watch + policy + Config Profile as source of truth for V3 demos.
- Keep `.frogbot/frogbot-config.yml` as documentation / V2 familiarity for colleagues, but verify every setting against a live run.
- Prefer workflow env (`JF_GIT_AGGREGATE_FIXES`, `JF_FIXABLE_ONLY`, `JF_MIN_SEVERITY`, …) when you need predictable demo behavior.

---

## 3. Related: autofix PRs missing (GitHub, not Xray)

Documented in full in [SPEC.md §8](SPEC.md#8-github-code-scanning--security-tab). Short form:

1. Enable **Allow GitHub Actions to create and approve pull requests**.
2. Delete orphaned `frogbot-*` branches.
3. Re-run repo scan.

Without (1), Frogbot creates fix branches then gets `403` on `POST .../pulls` — which is how this lab ended up with six branches and **zero** PRs before the fix.
