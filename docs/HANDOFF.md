# Handoff — what the other two folders need from web/

The site in `web/` replaces the ConfigMap site in `plattform/deploy/k8s/base/web/`. This file
has three parts: what **you** decide or click, the exact change for the **platform session**,
and what the **app session** needs. Nothing outside `web/` was edited; the platform change is
a patch in this repository (`docs/handoff/platform-web-image.patch`) for the platform session
to apply.

As of 2026-10-21.

---

## 1. For you

### Branch protection (blocked by the plan)

`timkrebs/ryft-web` is private, and GitHub answers the ruleset API with 403 "Upgrade to
GitHub Pro or make this repository public" (2026-10-21); classic branch protection has the
same limit. So `main` is not protected today: the sessions still work through PRs, but
nothing enforces it. Your choice:

| Option | Cost |
| --- | --- |
| GitHub Pro | Paid. Then run the ruleset below. |
| Make the repository public | Nothing secret is in it (gitleaks clean, the fonts are fetched at build time and never committed). The legal drafts and this handoff become public. Then run the ruleset below. |
| Leave it | `main` unprotected; a direct push is possible. |

```bash
gh api -X POST repos/timkrebs/ryft-web/rulesets --input - <<'JSON'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false, "require_last_push_approval": false,
        "required_review_thread_resolution": false, "allowed_merge_methods": ["squash"] } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "Checks" },
          { "context": "E2E, accessibility, links, Lighthouse" },
          { "context": "Secrets (gitleaks)" },
          { "context": "PR title" } ] } }
  ],
  "bypass_actors": []
}
JSON
gh repo edit timkrebs/ryft-web --enable-squash-merge --disable-merge-commit --disable-rebase-merge --delete-branch-on-merge
```

### Repository variables (public values, baked into the HTML)

```bash
gh variable set SUPPORT_EMAIL  --repo timkrebs/ryft-web --body "<address>"
gh variable set TESTFLIGHT_URL --repo timkrebs/ryft-web --body "https://testflight.apple.com/join/<code>"
```

While unset, the TestFlight buttons are hidden and the contact spots show a `TODO(user)`
marker. A change takes effect with the next image (the next green `main`).

### The image: private, readable by the platform

Every green `main` pushes `ghcr.io/timkrebs/ryft/web:<short-sha>` (and `:latest`); the first
was `abfbe26` on 2026-10-21. It contains the three Satoshi WOFF2 files, which the ITF Free
Font License lets us self-host but not offer for download, so the package stays **private**.
ghcr.io refuses an anonymous pull token for it (401), so it is not public now.

1. **Check its visibility** (your `gh` token needs `read:packages` for this):

   ```bash
   gh auth refresh -h github.com -s read:packages
   gh api /users/timkrebs/packages/container/ryft%2Fweb --jq .visibility    # private
   ```

   If it says `public`: github.com → your profile → Packages → `ryft/web` → Package settings →
   Danger Zone → Change visibility → Private.
2. **Let the platform's CI read it** (it checks that every pinned tag exists): the same
   Package settings page → Manage Actions access → Add repository → `timkrebs/ryft-platform`,
   role **Read**.
3. **A pull token for the cluster:** github.com → Settings → Developer settings → Personal
   access tokens → **Tokens (classic)** → Generate new token (classic). Note "ryft-web pull
   (cluster)", an expiry (a year; put the renewal in your calendar), scope **`read:packages`
   only**. GitHub Packages accepts no fine-grained tokens. Put it into
   `plattform/infra/vault/terraform.tfvars` (git-ignored) as `ghcr_pull_token = "ghp_…"`. The
   platform session takes it from there (section 2).

### New web releases reach the cluster: decide

Recommended: **this repository's CI opens the pin PR in `ryft-platform`**, with the platform's
GitHub App `ryft-deploy` (it already opens the platform's own "deploy: images" PRs). Section 2
→ 6 has the reasons and what changes. It needs, once you agree:

```bash
gh variable set RYFT_DEPLOY_APP_CLIENT_ID --repo timkrebs/ryft-web --body "Iv23lidXNXq0jv463BaX"   # the same App as in ryft-platform
gh secret set   RYFT_DEPLOY_APP_KEY       --repo timkrebs/ryft-web < <the App's private key>.pem
```

Until then a web release is a one-line pin PR in `ryft-platform` (section 2 → 3).

### Legal pages

`docs/LEGAL_CHECKLIST.md`: every `TODO(user)`, where it is, what it needs, and the facts about
the system with their sources. Publishing is section 4 of the go-live brief: your answers in,
`status: published` and `effective` in both languages, then a PR.

### Brand findings in app/ and plattform/

`docs/BRAND_CHECK.md`: **nothing user-facing** carries the denylisted name; one user-facing
warning (a planned feature name in `app/docs/APP_STORE.md:64`); 48 internal hits in
comments and docs, which are your call. Both repositories are public, so the most visible
is `plattform/README.md:3`, the platform's front page on GitHub.

---

## 2. Paste into the platform session (plattform/)

> **Switch `ryft-web` from ConfigMaps to the image built in `timkrebs/ryft-web`, pulled with
> a secret from Vault.** The site, its nginx config, the legal texts and the AASA now live in
> that repository; the image is `ghcr.io/timkrebs/ryft/web:<short-sha>`, built and pushed by
> its CI on every green `main` (multi-arch, provenance, Trivy-clean). It serves on 8080 as
> uid 101 with a read-only root filesystem (writable `/tmp` and `/var/cache/nginx`, as today)
> and answers `/healthz`. The package is **private** (the Satoshi licence forbids offering
> the font files for download), so the pods pull with a `kubernetes.io/dockerconfigjson`
> Secret that the Vault Secrets Operator syncs, like every other credential. Keep the
> Service, NetworkPolicy, Ingress, the `www` → apex redirect and the rate limit
> (`overlays/eks/web.yaml`) exactly as they are.
>
> **The change is a patch:** `git apply ../web/docs/handoff/platform-web-image.patch` (from
> the `plattform/` root, on a branch from `main`), then
> `git rm -r deploy/k8s/base/web/site deploy/k8s/base/web/default.conf`. The ryft-web session
> checked it on a copy of this tree at `003a1a9`: `git apply --check` clean; `terraform test`
> in `infra/vault` 22 passed (2 new runs); `kubeconform -strict` on the rendered EKS overlay,
> the generated web operator objects, the new golden file and the Argo CD files: 65 valid;
> `scripts/check_argocd.sh`: 12 applications. Re-run all of it here (`make k8s-validate`).
>
> **1. What the patch does**
>
> - `deploy/k8s/base/web`: the Deployment runs `ghcr.io/timkrebs/ryft/web` (no tag in base;
>   `overlays/eks` pins it) with `imagePullSecrets: [{ name: ghcr-pull }]`; the three ConfigMap
>   mounts and volumes and the `configMapGenerator` go.
> - `infra/vault`: a service `web = { registry_pull = true, manage_namespace = false,
>   workload_kind = "" }`. `registry_pull` writes `kv/ghcr-pull` in `admin/ryft/web` with
>   Docker's config JSON for `ghcr.io` (user `ghcr_pull_user`, default `timkrebs`; token
>   `ghcr_pull_token`, sensitive, validated as a classic `ghp_…` token), lets only web's
>   policy read it, and generates a `VaultStaticSecret` `ghcr-pull` with
>   `destination.type: kubernetes.io/dockerconfigjson`. Web gets no `kv/config` and no
>   `ryft-secrets`; nothing restarts (the kubelet reads the Secret on the next pull). A
>   `check` warns while the token is empty. Golden file `tests/golden/web.vault.yaml`.
> - **Why `manage_namespace = false`:** `ryft-web` is the one namespace kustomize makes
>   (`deploy/k8s/services/web/namespace.yaml`), and `ryft-platform` syncs with
>   `prune: true`. Moving it into `infra/vault` would mean removing it from git, and Argo CD
>   would prune the namespace, and the site with it, unless every step went right. So the
>   namespace stays Argo CD's; `infra/vault` only creates its objects in it (service accounts
>   `vault-auth` and `web`, the reviewer token, the auth-delegator binding) and no
>   `kubernetes_namespace_v1` for web. The four namespace references in
>   `kubernetes-auth.tf` go through `local.k8s_ns`, which resolves to the same names for
>   every existing service, so their plan doesn't change.
> - `deploy/argocd/apps/vault-web.yaml` (wave 0, like the other `vault-*` apps) applies
>   `deploy/k8s/overlays/vault-namespaces/web`; `project.yaml` ignores the orphaned
>   `Secret ghcr-pull` (VSO makes it).
> - `scripts/check_registry.sh` authenticates when `GHCR_TOKEN` is set; the `manifests` job
>   passes `GITHUB_TOKEN` with `packages: read` (the package grants this repository Read: the
>   ryft-web handoff, section 1).
> - `Makefile` break-glass: the web namespace and its pull secret before the services.
>
> **2. Order**
>
> 1. The user has made the package private, given `ryft-platform` Read access and put
>    `ghcr_pull_token` into `infra/vault/terraform.tfvars` (ryft-web handoff, section 1).
> 2. Branch, apply the patch, `git rm` as above.
> 3. `cd infra/vault && terraform test && terraform plan -out=tfplan`. Expect only
>    additions, all for web: the Vault namespace `ryft/web`, its Kubernetes auth mount,
>    config and role, `kv/` with `ghcr-pull`, the policy, the service accounts `vault-auth`
>    and `web` plus the token Secret in `ryft-web`, the ClusterRoleBinding
>    `ryft-web-vault-auth-delegator`, and the two generated files. **No change to any other
>    service** and no `kubernetes_namespace_v1`. Apply; restart the operator as usual; commit
>    `deploy/k8s/overlays/vault-namespaces/web`.
> 4. Pin the web tag in `overlays/eks/kustomization.yaml` (quoted; `"abfbe26"` on
>    2026-10-21, or newer):
>    `gh run list -R timkrebs/ryft-web --workflow ci --branch main --status success --limit 1 --json headSha --jq '.[0].headSha[:7]'`.
>    The current `newTag: "1015bc7"` for web pointed at nothing; no web image existed.
> 5. `make k8s-validate`, and the registry by hand:
>    `GHCR_TOKEN=$(gh auth token) ./scripts/check_registry.sh` (after
>    `gh auth refresh -h github.com -s read:packages`).
> 6. PR, merge. Argo CD: wave 0 `vault-web` syncs `ghcr-pull`, wave 3 rolls `web` (the old
>    pods serve until the new ones are ready). Then, by hand as always for that file:
>    `kubectl apply -f deploy/argocd/project.yaml`.
> 7. Check (all must stay 200; the AASA `application/json` without a redirect; the CSP now
>    carries the site's script hashes, the ConfigMap site's had none):
>
> ```bash
> kubectl -n ryft-web get secret ghcr-pull -o jsonpath='{.type}'; echo     # kubernetes.io/dockerconfigjson
> kubectl -n ryft-web get pods -l app=web -o jsonpath='{.items[*].spec.containers[0].image}'; echo
> for p in "" privacy terms support impressum de/privacy de/impressum privacy/2026-10-20 day/2026-10-19 auth/callback invite/TEST; do
>   curl -s -o /dev/null -w "%{http_code} %{content_type} /$p\n" https://ryftapp.de/$p; done
> curl -sI https://ryftapp.de/.well-known/apple-app-site-association | grep -iE "^HTTP|content-type|location"
> curl -sI https://ryftapp.de/privacy | grep -i content-security-policy | grep -c "sha256-"   # 1
> curl -sI https://ryftapp.de/privacy/ | grep -iE "^HTTP|location"    # 301 → /privacy
> curl -sI https://www.ryftapp.de/ | grep -i location                 # https://ryftapp.de/
> ```
>
> **3. A web release, until section 6 is in place:** a PR that changes only web's `newTag`
> (the short SHA of a green `main` run in ryft-web, quoted). `manifests` checks the tag
> exists; the merge deploys it. Rollback: revert that commit.
>
> **4. The minimum age (from the ryft-web legal review):** consent-based processing of
> health data needs parental consent under 16 in Germany (Art. 8 GDPR), and the legal texts
> will say 16. Raise `MinAge` in `backend/internal/scoring/maxhr.go` from 13 to 16, so
> `PATCH /v1/me` refuses `birth_year` later than this year − 16 (and `API.md` says so). The app
> raises its picker in the same release (ryft-web handoff, section 3).
>
> **5. Docs:** OPERATIONS → "Apex site and apple-app-site-association" now says the site is
> the `ryft-web` image (legal texts, AASA and nginx config in `timkrebs/ryft-web`,
> `content/legal/`; the AASA also covers `/invite/*` since 2026-10-21), a change there is a
> PR in that repository plus a tag bump here, and the pods pull with `ghcr-pull`. OPERATIONS →
> "Namespaces and identities": a row for `ryft-web` (Deployment `web`, `admin/ryft/web`,
> holds the pull secret only; namespace from kustomize). "A new policy text": change
> `PRIVACY_POLICY_VERSION` in both ConfigMaps **and** add
> `content/legal/{en,de}/privacy/<version>.mdx` in ryft-web (its CI warns while they differ).
> ARCHITECTURE line ~300 and STATUS's apex row: the same pointer. A decision: the web image is
> private and pulled with a Vault-synced secret; `infra/vault` doesn't own `ryft-web`.
> Nothing changes in `docs/API.md` except the age: `privacy_policy_url` stays
> `https://ryftapp.de/privacy`, `privacy_policy_version` stays `2026-10-20` until the user
> decides on a new version.
>
> **6. How new web tags reach the cluster: ryft-web's CI opens the pin PR (recommended).**
> After its image job has pushed and Trivy has passed, a `promote` job in ryft-web takes a
> token from the `ryft-deploy` App for `ryft-platform` only, sets web's `newTag` on a branch
> `deploy/web-<sha>`, opens `deploy: web <sha>` with the ryft-web commits since the running
> pin, closes an older `deploy/web-*` PR, and turns auto-merge on. Your checks run on it
> (`branches-ignore: deploy/**` already keeps them to one run), Argo CD deploys the merge, a
> revert rolls back. Why this way round and not `promote.sh` reading the newest tag from
> ghcr.io:
>
> - `promote` runs only on pushes to this repository's `main`, and only when `backend/`
>   changed, so a web-only release would wait for an unrelated backend change, or this
>   repository would need a schedule to poll;
> - "the newest tag" is not well defined: tags are short SHAs, so it means listing package
>   versions by date through the Packages API (with `read:packages` on a private package),
>   and ryft-web pushes the image **before** its Trivy step, so a poll could pick an image
>   that is about to fail;
> - one PR per web release keeps your loop: auto-merge on green, close to stop, revert to
>   roll back, and the commits listed.
>
> What it needs here: one line in `scripts/promote.sh`, so a backend promote doesn't close a
> web pin PR as "superseded" (they edit different lines and don't conflict):
>
> ```diff
> -for n in $(gh pr list --state open --json number,headRefName --jq '.[] | select(.headRefName | startswith("deploy/")) | .number'); do
> +for n in $(gh pr list --state open --json number,headRefName --jq '.[] | select((.headRefName | startswith("deploy/")) and (.headRefName | startswith("deploy/web-") | not)) | .number'); do
> ```
>
> and the user sets the App's client ID and key in ryft-web (its handoff, section 1). The App
> needs no installation on ryft-web; its token is for `ryft-platform`, where it already has
> contents and pull-request write.
>
> Optional, not needed for the switch:
>
> - **Brotli**: the image serves precompressed gzip (no brotli module in the official nginx
>   image). Traefik's `compress` middleware on the `web` Ingress could add brotli.
> - **A public JSON for the web's version check**: `GET https://api.ryftapp.de/v1/legal`
>   without auth → `{"privacy_policy_version": "2026-10-20", "privacy_policy_url":
>   "https://ryftapp.de/privacy"}`. ryft-web reads it when `PLATFORM_LEGAL_URL` is set; until
>   then its CI reads your ConfigMaps from a checkout, which works.

---

## 3. Paste into the app session (app/)

> **ryftapp.de moves to a new build; every URL the app uses stays the same.** What the app
> links to (checked against `ryft-app` `main`, 2026-10-21):
>
> | URL | Where in the app | On the new site |
> | --- | --- | --- |
> | `https://ryftapp.de/privacy` | `Design/SafariView.swift`, `Features/Auth/WelcomeView.swift`, `CreateAccountView.swift`, `Localizable.xcstrings` (en, de) | 200, the privacy policy (version 2026-10-20) |
> | `https://ryftapp.de/terms` | `Design/SafariView.swift`, `CreateAccountView.swift`, `Localizable.xcstrings` | 200 |
> | `https://ryftapp.de/auth/callback` | `App/SupabaseConfig.swift` (`universalRedirectURL`) | 200, "Open this in RYFT", `no-store`, no script reads the URL |
> | `https://ryftapp.de/<path>` universal links | `Navigation/AppRoute.swift` | 200 "Open this in RYFT" for `/day/*`, `/sleep/*`, `/insights/*`, `/train/*`, `/auth/*`, `/invite/*` |
> | `https://ryftapp.de/.well-known/apple-app-site-association` | (Associated Domains, not added yet) | `application/json`, no redirect; every path `AppRoute.url` creates, **now including `/invite/*`** (your `API_REQUESTS.md` → Universal links, 2026-10-21) |
> | `https://ryftapp.de/support`, `https://ryftapp.de` | `docs/APP_STORE.md`, `docs/TESTFLIGHT.md` (App Store Connect fields) | 200 |
>
> Once the platform has switched to the new image (it serves the AASA then), add
> `applinks:ryftapp.de` under Signing & Capabilities → Associated Domains, as your
> `API_REQUESTS.md` plans; ryft-web's test checks the AASA against `AppRoute` on every PR.
>
> **Requests from the legal review:**
>
> - **Minimum age 16.** Consent-based processing of health data needs parental consent under
>   16 in Germany (Art. 8 GDPR), and the privacy policy and terms will say 16. Raise the
>   youngest birth year in About you and Profile → Body to this year − 16
>   (`OnboardingCoordinator.latestBirthYear`, today `− 13`, and the "Choose a year between…"
>   message). The platform raises `birth_year` validation in the same release (its handoff,
>   item 4). Note: birth year is optional, so it is no age check by itself; whether
>   Create account also asks "I am 16 or older" is the user's call.
> - **Saving workouts to Apple Health** (your beta feedback brief, section 3): when it ships,
>   tell ryft-web the exact wording of the opt-in and what is written (`HKWorkout`
>   `.traditionalStrengthTraining`, start, end, energy if known, no heart rate), so the
>   privacy policy says the same in English and German.
> - **"Profile → Report a problem"** is named in `docs/TESTFLIGHT.md:85`, but the app has no
>   such screen yet (`POST /v1/feedback` is in `APIClient` and `Models.swift`, nothing calls
>   it). The support page will name whatever exists when it is published: build the screen,
>   or change the doc to TestFlight's screenshot feedback.
>
> Optional:
>
> - New captures for the website, in dark **and** light, as 1206 × 2622 simulator
>   screenshots in `docs/screenshots/`: `today-{dark,light}.png` (the current Preview
>   captures show the readiness number missing or overlapping mid-animation, so the site
>   draws its Today hero natively); `journal-{dark,light}.png`; `profile-data-{dark,light}.png`
>   (Profile → Data with "Export my data"). The website picks them up with
>   `npm run screenshots`.
> - The in-app Licences screen and `ryftapp.de/licenses` list the same Swift packages
>   (ryft-web's CI fails when `Package.resolved` changes without its snapshot; synced for the
>   bump in ryft-app #7). If a package is added, run `npm run licenses -- --sync` in ryft-web.
