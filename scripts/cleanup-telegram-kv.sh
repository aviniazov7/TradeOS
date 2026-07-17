#!/usr/bin/env bash
# One-time cleanup of Telegram-bot-era KV keys (#219 phase 2).
# Run from the repo root with a Cloudflare login that has access to the
# account the trade-os Worker runs on:  bash scripts/cleanup-telegram-kv.sh
# Dry-run by default; pass --delete to actually remove the keys.
set -euo pipefail

PREFIXES=(user: uid: settings: watchlist: tgconnect: tgusage: tgusername: dailystats: alerts:)
DELETE=${1:-}

for prefix in "${PREFIXES[@]}"; do
  echo "── prefix: $prefix"
  keys=$(npx wrangler kv key list --binding ALERTS_KV --remote --prefix "$prefix" | node -e "
    let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
      try { JSON.parse(s).forEach(k=>console.log(k.name)); } catch {}
    })")
  # usettings:*/dailystats:u:* are the NEW uid-keyed push data — never delete.
  keys=$(echo "$keys" | grep -v '^usettings:' | grep -v '^dailystats:u:' | grep -v '^settings:ALL$' || true)
  count=$(echo "$keys" | grep -c . || true)
  echo "   $count keys"
  if [ "$DELETE" = "--delete" ] && [ "$count" -gt 0 ]; then
    while IFS= read -r key; do
      [ -z "$key" ] && continue
      npx wrangler kv key delete --binding ALERTS_KV --remote "$key" >/dev/null && echo "   deleted $key"
    done <<< "$keys"
  fi
done
echo "Done. $([ "$DELETE" = "--delete" ] && echo 'Keys deleted.' || echo 'Dry run — rerun with --delete to remove.')"
