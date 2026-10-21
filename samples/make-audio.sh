#!/bin/sh
set -eu
if [ "$(uname)" != "Darwin" ]; then
  echo "Este script requiere macOS para usar la voz Paulina." >&2
  exit 1
fi
mkdir -p samples/audio
temporary=$(mktemp)
trap 'rm -f "$temporary"' EXIT
tab=$(printf '\t')
node --input-type=module -e "
  import { readFile } from 'node:fs/promises';
  const requests = JSON.parse(await readFile('samples/requests.json', 'utf8'));
  for (const request of requests) console.log(request.id + '\\t' + request.text);
" > "$temporary"

while IFS="$tab" read -r id text; do
  say -v Paulina -r 185 -o "samples/audio/${id}.aiff" "$text"
  ffmpeg -y -i "samples/audio/${id}.aiff" -c:a aac "samples/audio/${id}.m4a"
done < "$temporary"
