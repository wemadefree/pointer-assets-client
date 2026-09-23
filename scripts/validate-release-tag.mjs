import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const tag = process.argv[2] ?? process.env.RELEASE_TAG;

if (typeof tag !== "string" || tag.length === 0) {
  throw new Error("A release tag is required");
}

if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(packageJson.version)) {
  throw new Error(
    `package.json version must be a stable SemVer version, received ${packageJson.version}`,
  );
}

const expectedTag = `v${packageJson.version}`;
if (tag !== expectedTag) {
  throw new Error(`Release tag ${tag} must exactly match ${expectedTag}`);
}

console.log(`Release tag ${tag} matches ${packageJson.name}@${packageJson.version}`);
