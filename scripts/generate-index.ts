// Regenerates index.json at the repo root: the sorted list of video IDs that
// have at least one subtitle file under subtitles/. Clients fetch this index
// to check subtitle availability locally instead of probing the CDN per video.
//
// Usage:
//   bun scripts/generate-index.ts          # rewrite index.json
//   bun scripts/generate-index.ts --check  # exit 1 if index.json is stale; writes nothing
//
// Committing normally regenerates the index automatically via the pre-commit
// hook — enable once per clone: git config core.hooksPath scripts/githooks
//
// After pushing, purge the CDN copy:
//   https://purge.jsdelivr.net/gh/hytt-rice-porridge/hytt-subs@main/index.json

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const subtitlesDir = join(repoRoot, "subtitles");
const indexPath = join(repoRoot, "index.json");

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})?$/;

const check = process.argv.includes("--check");

function warn(message: string) {
  console.error(`warning: ${message}`);
}

const videos: string[] = [];
for (const entry of readdirSync(subtitlesDir, { withFileTypes: true })) {
  if (entry.name.startsWith(".")) continue;
  if (!entry.isDirectory()) {
    warn(`subtitles/${entry.name} is not a directory; ignored`);
    continue;
  }
  const id = entry.name;
  if (!VIDEO_ID_RE.test(id)) {
    warn(`subtitles/${id}/ is not named like a video ID; ignored`);
    continue;
  }
  let hasSrt = false;
  for (const file of readdirSync(join(subtitlesDir, id))) {
    if (!file.endsWith(".srt")) continue;
    const lang = file.startsWith(`${id}.`)
      ? file.slice(id.length + 1, -".srt".length)
      : null;
    if (lang !== null && LANG_RE.test(lang)) {
      hasSrt = true;
    } else {
      warn(`subtitles/${id}/${file} does not match ${id}.<lang>.srt; ignored`);
    }
  }
  if (hasSrt) {
    videos.push(id);
  } else {
    warn(`subtitles/${id}/ has no ${id}.<lang>.srt files; not indexed`);
  }
}

if (videos.length === 0) {
  console.error("error: found no subtitled videos; refusing to write an empty index");
  process.exit(1);
}

videos.sort();
const content = JSON.stringify({ format_version: 1, videos }, null, 2) + "\n";
const existing = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : null;

if (check) {
  if (existing !== content) {
    console.error(
      existing === null
        ? "index.json is missing; run: bun scripts/generate-index.ts"
        : "index.json is stale; run: bun scripts/generate-index.ts",
    );
    if (existing !== null) {
      try {
        const old: string[] = JSON.parse(existing).videos ?? [];
        const oldSet = new Set(old);
        const newSet = new Set(videos);
        const missing = videos.filter((v) => !oldSet.has(v));
        const extra = old.filter((v) => !newSet.has(v));
        if (missing.length) console.error(`  missing from index: ${missing.join(", ")}`);
        if (extra.length) console.error(`  no longer present: ${extra.join(", ")}`);
      } catch {
        // Unparseable index — the stale message above is enough.
      }
    }
    process.exit(1);
  }
  console.log(`index.json is up to date (${videos.length} videos).`);
} else {
  writeFileSync(indexPath, content);
  console.log(
    existing === content
      ? `index.json unchanged (${videos.length} videos).`
      : `index.json written (${videos.length} videos).`,
  );
}
