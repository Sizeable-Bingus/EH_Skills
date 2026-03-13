#!/usr/bin/env bash
set -euo pipefail

readonly DEFAULT_OWNER="Sizeable-Bingus"
readonly DEFAULT_REPO="EH_Skills"
readonly DEFAULT_INTERVAL=30
readonly DEFAULT_TIMEOUT=600

usage() {
  cat <<'EOF'
Usage:
  scripts/pr-review-loop.sh status [--pr NUMBER] [--owner OWNER] [--repo REPO]
  scripts/pr-review-loop.sh watch [--pr NUMBER] [--owner OWNER] [--repo REPO] [--interval SECONDS] [--timeout SECONDS]
  scripts/pr-review-loop.sh resolve --thread-id THREAD_ID [--owner OWNER] [--repo REPO]

Commands:
  status   Print one JSON snapshot for the current PR review state.
  watch    Poll unresolved review threads until the timeout expires.
  resolve  Resolve a review thread after the fix has been pushed.

Defaults:
  owner    Sizeable-Bingus
  repo     EH_Skills
  interval 30 seconds
  timeout  600 seconds

The PR number defaults to the current branch's PR via `gh pr view`.
For `watch`, the timeout resets whenever the local `HEAD` commit changes.
EOF
}

require_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI is required" >&2
    exit 1
  fi
}

resolve_pr_number() {
  local pr_number="$1"

  if [[ -n "$pr_number" ]]; then
    printf '%s\n' "$pr_number"
    return
  fi

  gh pr view --json number --jq '.number'
}

fetch_review_comments_meta() {
  local owner="$1"
  local repo="$2"
  local pr_number="$3"

  gh api "repos/$owner/$repo/pulls/$pr_number/comments" \
    --paginate \
    --jq 'sort_by(.created_at) | {count: length, latest: (.[-1].created_at // "")}'
}

fetch_unresolved_threads() {
  local owner="$1"
  local repo="$2"
  local pr_number="$3"

  gh api graphql \
    -f query='
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) {
              nodes {
                isResolved
                id
                comments(first: 1) {
                  nodes {
                    body
                    path
                    line
                    createdAt
                    author { login }
                  }
                }
              }
            }
          }
        }
      }
    ' \
    -F owner="$owner" \
    -F repo="$repo" \
    -F number="$pr_number" \
    --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | {thread_id: .id} + (.comments.nodes[0] | {body, path, line, user: .author.login, created_at: .createdAt})]'
}

current_head_commit() {
  git rev-parse HEAD
}

epoch_to_iso() {
  date -u -r "$1" '+%Y-%m-%dT%H:%M:%SZ'
}

print_status() {
  local owner="$1"
  local repo="$2"
  local pr_number="$3"
  local check_index="$4"
  local now_iso="$5"
  local head_commit="$6"
  local timeout_started_at="$7"
  local timeout_deadline="$8"
  local latest
  local unresolved

  latest="$(fetch_review_comments_meta "$owner" "$repo" "$pr_number" | tr -d '\n')"
  unresolved="$(fetch_unresolved_threads "$owner" "$repo" "$pr_number" | tr -d '\n')"

  printf '{"check":%s,"time":"%s","pr":%s,"head":"%s","timeout_started_at":"%s","timeout_deadline":"%s","latest":%s,"unresolved":%s}\n' \
    "$check_index" \
    "$now_iso" \
    "$pr_number" \
    "$head_commit" \
    "$timeout_started_at" \
    "$timeout_deadline" \
    "$latest" \
    "$unresolved"
}

watch_loop() {
  local owner="$1"
  local repo="$2"
  local pr_number="$3"
  local interval="$4"
  local timeout="$5"
  local timeout_started_at
  local deadline
  local tracked_head
  local current_head
  local check_index=0
  local now_epoch
  local remaining

  timeout_started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  tracked_head="$(current_head_commit)"
  deadline=$(( $(date +%s) + timeout ))

  while true; do
    current_head="$(current_head_commit)"
    if [[ "$current_head" != "$tracked_head" ]]; then
      tracked_head="$current_head"
      timeout_started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
      deadline=$(( $(date +%s) + timeout ))
    fi

    check_index=$((check_index + 1))
    print_status \
      "$owner" \
      "$repo" \
      "$pr_number" \
      "$check_index" \
      "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
      "$tracked_head" \
      "$timeout_started_at" \
      "$(epoch_to_iso "$deadline")"

    now_epoch="$(date +%s)"
    if (( now_epoch >= deadline )); then
      break
    fi

    remaining=$((deadline - now_epoch))
    if ((remaining <= 0)); then
      break
    fi

    if ((remaining < interval)); then
      sleep "$remaining"
    else
      sleep "$interval"
    fi
  done
}

resolve_thread() {
  local thread_id="$1"

  gh api graphql \
    -f query='
      mutation($threadId: ID!) {
        resolveReviewThread(input: {threadId: $threadId}) {
          thread { isResolved }
        }
      }
    ' \
    -F threadId="$thread_id"
}

main() {
  require_gh

  local command="${1:-watch}"
  local owner="$DEFAULT_OWNER"
  local repo="$DEFAULT_REPO"
  local pr_number=""
  local interval="$DEFAULT_INTERVAL"
  local timeout="$DEFAULT_TIMEOUT"
  local thread_id=""

  if [[ "$command" == "-h" || "$command" == "--help" || "$command" == "help" ]]; then
    usage
    exit 0
  fi

  if (($# > 0)); then
    shift
  fi

  while (($# > 0)); do
    case "$1" in
      --owner)
        owner="$2"
        shift 2
        ;;
      --repo)
        repo="$2"
        shift 2
        ;;
      --pr)
        pr_number="$2"
        shift 2
        ;;
      --interval)
        interval="$2"
        shift 2
        ;;
      --timeout)
        timeout="$2"
        shift 2
        ;;
      --thread-id)
        thread_id="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done

  case "$command" in
    status)
      pr_number="$(resolve_pr_number "$pr_number")"
      local now_iso
      now_iso="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
      print_status \
        "$owner" \
        "$repo" \
        "$pr_number" \
        "1" \
        "$now_iso" \
        "$(current_head_commit)" \
        "$now_iso" \
        "$now_iso"
      ;;
    watch)
      pr_number="$(resolve_pr_number "$pr_number")"
      watch_loop "$owner" "$repo" "$pr_number" "$interval" "$timeout"
      ;;
    resolve)
      if [[ -z "$thread_id" ]]; then
        echo "--thread-id is required for resolve" >&2
        exit 1
      fi
      resolve_thread "$thread_id"
      ;;
    *)
      echo "Unknown command: $command" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
