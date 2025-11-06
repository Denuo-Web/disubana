#!/usr/bin/env bash

# Synchronise Google Secret Manager entries with values from an .env file.
# Requires: gcloud CLI, PROJECT_ID exported in the current shell.

set -euo pipefail

trim() {
  local var="${1}"
  # Strip leading whitespace
  var="${var#"${var%%[![:space:]]*}"}"
  # Strip trailing whitespace
  var="${var%"${var##*[![:space:]]}"}"
  printf '%s' "${var}"
}

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required but not found in PATH" >&2
  exit 1
fi

: "${PROJECT_ID:?Set PROJECT_ID environment variable before running this script}"

ENV_FILE="${1:-.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Env file '${ENV_FILE}' not found" >&2
  exit 1
fi

while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
  line="$(trim "${raw_line}")"

  # Skip comments and empty lines.
  [[ -z "${line}" || "${line:0:1}" == "#" ]] && continue

  # Ignore lines without an assignment.
  [[ "${line}" != *"="* ]] && continue

  key="${line%%=*}"
  value="${line#*=}"

  key="$(trim "${key}")"
  value="$(trim "${value}")"

  # Allow optional "export KEY=" prefix.
  if [[ "${key}" == export* ]]; then
    key="${key#export }"
    key="$(trim "${key}")"
  fi

  if [[ -z "${key}" ]]; then
    echo "Skipping entry with empty key: ${raw_line}" >&2
    continue
  fi

  # Remove surrounding single or double quotes from the value.
  if [[ "${#value}" -ge 2 ]]; then
    first_char="${value:0:1}"
    last_char="${value: -1}"
    if [[ "${first_char}" == "'" && "${last_char}" == "'" ]]; then
      value="${value:1:-1}"
    elif [[ "${first_char}" == '"' && "${last_char}" == '"' ]]; then
      value="${value:1:-1}"
    fi
  fi

  echo "Syncing secret ${key}"

  if ! gcloud secrets describe "${key}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud secrets create "${key}" \
      --replication-policy="automatic" \
      --project="${PROJECT_ID}"
  fi

  printf '%s' "${value}" | gcloud secrets versions add "${key}" \
    --project="${PROJECT_ID}" \
    --data-file=-

done < "${ENV_FILE}"

