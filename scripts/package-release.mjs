import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", windowsHide: true }).trim();
if (resolve(git(["rev-parse", "--show-toplevel"])) !== process.cwd())
  throw Error("Run packaging from the repository root.");
if (git(["status", "--porcelain", "--untracked-files=normal"]))
  throw Error("Source packaging requires a clean committed tree.");
const metadata = JSON.parse(readFileSync("package.json", "utf8")),
  version = metadata.version;
if (
  metadata.name !== "lazer" ||
  metadata.license !== "MIT" ||
  !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version)
)
  throw Error("Expected stable Lazer version and MIT metadata.");
const commit = git(["rev-parse", "HEAD"]),
  tree = git(["rev-parse", "HEAD^{tree}"]);
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== commit)
  throw Error("Checkout differs from the workflow commit.");
const directory = resolve("release-artifacts");
mkdirSync(directory, { recursive: true });
const filename = `lazer_${version}_source.zip`,
  output = resolve(directory, filename);
execFileSync(
  "git",
  [
    "-c",
    "core.autocrlf=false",
    "archive",
    "--format=zip",
    `--prefix=lazer-${version}/`,
    `--output=${output}`,
    "HEAD",
  ],
  { windowsHide: true },
);
const digest = (data) => createHash("sha256").update(data).digest("hex"),
  bytes = readFileSync(output);
const manifest = {
  repository: "agammann/lazer",
  version,
  commit,
  tree,
  source: { filename, bytes: bytes.length, sha256: digest(bytes) },
  requirements: {
    node: metadata.engines.node,
    npm: metadata.packageManager,
    playwright: metadata.devDependencies.playwright,
    miniflare: metadata.devDependencies.miniflare,
  },
  schemaVersion: 1,
  delivery:
    "Bitcoin derivatives practice and developer starter. No wallet seed, local database, browser profile, dependency cache or generated build in the source ZIP.",
};
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(resolve(directory, "release-manifest.json"), manifestBytes);
const checksum = digest(bytes) + "  " + filename + "\n";
writeFileSync(output + ".sha256", checksum);
writeFileSync(
  resolve(directory, "SHA256SUMS"),
  checksum + digest(manifestBytes) + "  release-manifest.json\n",
);
console.log(`Packaged ${filename} from ${commit}`);
