#!/usr/bin/env bash
# Vercel "Ignored Build Step" for GongWizard — skip production builds for no-op
# commits (only non-runtime files changed). Wired via vercel.json
# ("ignoreCommand": "bash scripts/ci/vercel-ignore-build.sh").
#
# Contract: exit 0 = SKIP the build, exit 1 = BUILD. EVERY uncertainty -> BUILD.
# A wrong BUILD costs pennies; a wrong SKIP ships stale code. Never skip-biased.
#
# HOW the changed-file list is recovered (measured live in the BingWow sandbox
# 2026-07-15, same Vercel platform):
#   PRIMARY  — tokenless `git diff --name-only PREV HEAD`. Sandbox HAS .git; the
#     ~10-deep shallow clone includes VERCEL_GIT_PREVIOUS_SHA.
#   FALLBACK — GitHub compare API over HTTPS, ONLY when PREV is outside the clone
#     (long docs-only streak). Needs IGNORE_BUILD_GH_TOKEN (Contents:read) in the
#     Vercel prod env; absent for now -> fail-open to BUILD (zero secrets to be
#     safe). `git fetch --deepen` is dead in the sandbox (creds stripped).
#   FAIL-OPEN — neither recovers a trustworthy list -> BUILD.
# Diff base is ALWAYS VERCEL_GIT_PREVIOUS_SHA (last DEPLOYED commit; skipped
# deploys do NOT advance it), never a parent-of-HEAD fallback: PREV..HEAD spans
# every skipped intermediate commit, so it can only over-build, never wrong-skip.

REPO="forrestmill-cmd/gongwizard"
PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
HEAD_SHA="${VERCEL_GIT_COMMIT_SHA:-}"
CHANGED=""
DIFFED=0

if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "[ignore-build] non-production (VERCEL_ENV='${VERCEL_ENV:-}') -> SKIP"
  exit 0
fi

# 1) PRIMARY: tokenless git diff, only when BOTH commit objects are in the clone.
if [ -n "$PREV" ] && [ -n "$HEAD_SHA" ] && [ "$PREV" != "$HEAD_SHA" ] && command -v git >/dev/null 2>&1; then
  if git cat-file -t "$PREV" >/dev/null 2>&1 && git cat-file -t "$HEAD_SHA" >/dev/null 2>&1; then
    if CHANGED="$(git diff --name-only "$PREV" "$HEAD_SHA" 2>/tmp/ib_giterr)"; then
      DIFFED=1
      echo "[ignore-build] changed-file list via git diff ${PREV:0:7}..${HEAD_SHA:0:7}"
    else
      echo "[ignore-build] git diff failed: $(head -c 160 /tmp/ib_giterr 2>/dev/null)"
    fi
  else
    echo "[ignore-build] PREV ${PREV:0:7} not in shallow clone (depth-limited) — trying compare API"
  fi
fi

# 2) FALLBACK: GitHub compare API over HTTPS, when PREV is outside the clone and a token exists.
if [ "$DIFFED" != "1" ] && [ -n "$PREV" ] && [ -n "$HEAD_SHA" ] && [ "$PREV" != "$HEAD_SHA" ] \
   && [ -n "${IGNORE_BUILD_GH_TOKEN:-}" ] && command -v curl >/dev/null 2>&1; then
  API_URL="https://api.github.com/repos/${REPO}/compare/${PREV}...${HEAD_SHA}"
  RAW="$(curl -sS --max-time 25 -w $'\n%{http_code}' \
    -H "Authorization: Bearer ${IGNORE_BUILD_GH_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$API_URL" 2>/tmp/ib_curlerr)"
  HTTP_CODE="$(printf '%s' "$RAW" | tail -n1)"
  BODY="$(printf '%s' "$RAW" | sed '$d')"
  echo "[ignore-build] compare ${PREV:0:7}...${HEAD_SHA:0:7} -> HTTP ${HTTP_CODE}"
  if [ "$HTTP_CODE" = "200" ]; then
    CHANGED="$(printf '%s' "$BODY" | node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        try{
          const j=JSON.parse(s);
          if(!Array.isArray(j.files)) process.exit(3);
          if(j.files.length >= 300) process.exit(4);
          const out=[];
          for(const f of j.files){ if(f.filename) out.push(f.filename); if(f.previous_filename) out.push(f.previous_filename); }
          process.stdout.write(out.join("\n"));
        }catch(e){ process.exit(2); }
      });
    ' 2>/dev/null)" && DIFFED=1
    [ "$DIFFED" = "1" ] && echo "[ignore-build] changed-file list recovered via GitHub compare API"
  fi
  [ "$DIFFED" != "1" ] && echo "[ignore-build] compare API unusable (HTTP ${HTTP_CODE}) -> BUILD (fail-open)"
fi

# 3) FAIL-OPEN: no trustworthy changed-file list -> BUILD.
if [ "$DIFFED" != "1" ]; then
  echo "[ignore-build] could not recover changed files (PREV='${PREV}' HEAD='${HEAD_SHA}') -> BUILD (fail-open)"
  exit 1
fi
[ -z "$CHANGED" ] && { echo "[ignore-build] empty changed-file list -> BUILD (fail-open)"; exit 1; }

# 4) Classify. deploy-paths.mjs exit contract == Vercel's: 0 = SKIP, 1 = BUILD.
if ! printf '%s\n' "$CHANGED" | node scripts/ci/deploy-paths.mjs; then
  echo "[ignore-build] runtime file(s) changed -> BUILD:"
  printf '%s\n' "$CHANGED" | sed '/^$/d; s/^/  changed: /'
  exit 1
fi
echo "[ignore-build] no-op commit (only non-runtime files) -> SKIP build:"
printf '%s\n' "$CHANGED" | sed '/^$/d; s/^/  skip: /'
exit 0
