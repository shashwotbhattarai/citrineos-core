#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2025 Yatri Motorcycles
#
# SPDX-License-Identifier: Apache-2.0

# Local CI check script — mirrors the 4 PR workflows:
#   1. Lint
#   2. Jest Tests
#   3. REUSE License Check
#   4. Integration Test (docker compose + health check)
#
# Usage:
#   ./scripts/ci-check.sh              # Run all checks
#   ./scripts/ci-check.sh lint         # Run only lint
#   ./scripts/ci-check.sh test         # Run only jest tests
#   ./scripts/ci-check.sh license      # Run only license check
#   ./scripts/ci-check.sh integ        # Run only integration test
#   ./scripts/ci-check.sh lint test    # Run multiple checks

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

PASSED=0
FAILED=0
SKIPPED=0
SUMMARY=""

print_header() {
  echo ""
  echo -e "${BOLD}======================================${NC}"
  echo -e "${BOLD}  $1${NC}"
  echo -e "${BOLD}======================================${NC}"
}

record_result() {
  local name="$1"
  local status="$2"
  if [ "$status" = "pass" ]; then
    SUMMARY="${SUMMARY}  ${GREEN}PASS${NC}  ${name}\n"
    PASSED=$((PASSED + 1))
  elif [ "$status" = "fail" ]; then
    SUMMARY="${SUMMARY}  ${RED}FAIL${NC}  ${name}\n"
    FAILED=$((FAILED + 1))
  else
    SUMMARY="${SUMMARY}  ${YELLOW}SKIP${NC}  ${name}\n"
    SKIPPED=$((SKIPPED + 1))
  fi
}

# ─── 1. Lint ───────────────────────────────────────────────
run_lint() {
  print_header "1/4  Lint"
  cd "$ROOT_DIR"
  if npm run lint; then
    record_result "Lint" "pass"
  else
    record_result "Lint" "fail"
  fi
}

# ─── 2. Jest Tests ─────────────────────────────────────────
run_tests() {
  print_header "2/4  Jest Tests"
  cd "$ROOT_DIR"
  if NODE_OPTIONS="--max_old_space_size=4096" npm test; then
    record_result "Jest Tests" "pass"
  else
    record_result "Jest Tests" "fail"
  fi
}

# ─── 3. REUSE License Check ───────────────────────────────
run_license() {
  print_header "3/4  REUSE License Check"
  cd "$ROOT_DIR"

  if ! command -v reuse >/dev/null 2>&1; then
    echo -e "${YELLOW}reuse tool not installed. Install with: pip install reuse${NC}"
    record_result "REUSE License Check" "skip"
    return
  fi

  if reuse lint >/dev/null 2>&1; then
    echo "All files have proper license compliance."
    record_result "REUSE License Check" "pass"
    return
  fi

  # Check against ignore list (mirrors the CI workflow logic)
  if [ ! -f ".reuse/ignore-files.txt" ]; then
    echo -e "${RED}REUSE lint failed and no .reuse/ignore-files.txt found${NC}"
    reuse lint 2>&1 || true
    record_result "REUSE License Check" "fail"
    return
  fi

  local tmpdir
  tmpdir=$(mktemp -d)
  reuse lint >"$tmpdir/reuse_output.txt" 2>&1 || true
  sed '/SUMMARY/q' "$tmpdir/reuse_output.txt" | grep "^\* " | sed 's/^\* //' >"$tmpdir/failing.txt" || true

  local has_unignored=false
  while IFS= read -r failing_file; do
    local ignored=false
    while IFS= read -r pattern; do
      case "$pattern" in
        ""|\#*) continue ;;
      esac
      pattern=$(echo "$pattern" | sed 's/[[:space:]]*$//')
      # Exact match
      if [ "$failing_file" = "$pattern" ]; then
        ignored=true; break
      fi
      # Directory prefix match
      case "$pattern" in
        */) [ "${failing_file#$pattern}" != "$failing_file" ] && ignored=true && break ;;
      esac
      # Glob match (e.g. *.md, *.pdf)
      case "$failing_file" in
        $pattern) ignored=true; break ;;
      esac
    done <".reuse/ignore-files.txt"
    if [ "$ignored" = false ]; then
      echo "  Not ignored: $failing_file"
      has_unignored=true
    fi
  done <"$tmpdir/failing.txt"

  local failing_count
  failing_count=$(wc -l <"$tmpdir/failing.txt" | tr -d ' ')
  rm -rf "$tmpdir"

  if [ "$has_unignored" = true ]; then
    record_result "REUSE License Check" "fail"
  else
    echo "All failures accounted for in .reuse/ignore-files.txt (${failing_count} ignored)"
    record_result "REUSE License Check" "pass"
  fi
}

# ─── 4. Integration Test (Docker Compose + Health Check) ──
run_integ() {
  print_header "4/4  Integration Test (Docker + Health Check)"
  cd "$ROOT_DIR/Server"

  if ! command -v docker >/dev/null 2>&1; then
    echo -e "${YELLOW}docker not found — skipping integration test${NC}"
    record_result "Integration Test" "skip"
    return
  fi

  if ! docker info >/dev/null 2>&1; then
    echo -e "${YELLOW}Docker daemon not running — skipping integration test${NC}"
    record_result "Integration Test" "skip"
    return
  fi

  echo "Starting docker compose..."
  docker compose -f docker-compose-local.yml up -d

  echo "Waiting for server to be ready..."
  local retry=0
  local max_retries=12
  local healthy=false
  while [ $retry -lt $max_retries ]; do
    if curl -sf http://localhost:8080/health >/dev/null 2>&1; then
      healthy=true
      break
    fi
    retry=$((retry + 1))
    echo "  Attempt $retry/$max_retries — retrying in 10s..."
    sleep 10
  done

  if [ "$healthy" = true ]; then
    echo -e "${GREEN}Health check passed${NC}"
    record_result "Integration Test" "pass"
  else
    echo -e "${RED}Health check failed after $max_retries attempts${NC}"
    echo "Container logs:"
    docker compose -f docker-compose-local.yml logs --tail=50 || true
    record_result "Integration Test" "fail"
  fi

  echo "Tearing down containers..."
  docker compose -f docker-compose-local.yml down
}

# ─── Main ──────────────────────────────────────────────────
run_selected="${*:-}"

echo -e "${BOLD}CitrineOS Local CI Check${NC}"
echo "Mirrors GitHub PR workflows: lint, jest-tests, license-check, test-build-server"
echo ""

if [ -z "$run_selected" ]; then
  run_lint
  run_tests
  run_license
  run_integ
else
  for arg in $run_selected; do
    case "$arg" in
      lint)    run_lint ;;
      test)    run_tests ;;
      license) run_license ;;
      integ)   run_integ ;;
      *)       echo -e "${RED}Unknown check: $arg${NC}"; echo "Valid: lint test license integ"; exit 1 ;;
    esac
  done
fi

# ─── Summary ──────────────────────────────────────────────
echo ""
echo -e "${BOLD}======================================${NC}"
echo -e "${BOLD}  Summary${NC}"
echo -e "${BOLD}======================================${NC}"
echo -e "$SUMMARY"
echo -e "  ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}, ${YELLOW}$SKIPPED skipped${NC}"
echo ""

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
