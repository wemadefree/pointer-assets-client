import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryDirectory = mkdtempSync(join(tmpdir(), "pointer-assets-package-"));

const requiredFiles = [
  "LICENSE",
  "README.md",
  "dist/index.cjs",
  "dist/index.cjs.map",
  "dist/index.d.cts",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/index.js.map",
  "package.json",
];
const forbiddenPrefixes = [
  ".github/",
  "scripts/",
  "src/",
  "test/",
  "coverage/",
  "node_modules/",
];

try {
  const packOutput = execFileSync(
    "npm",
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      temporaryDirectory,
    ],
    { cwd: root, encoding: "utf8" },
  );
  const [packResult] = JSON.parse(packOutput);
  if (!packResult) {
    throw new Error("npm pack did not return package metadata");
  }

  const packagedFiles = packResult.files
    .map(({ path }) => path)
    .sort();
  const expectedFiles = [...requiredFiles].sort();
  if (JSON.stringify(packagedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `Unexpected package contents:\n${packagedFiles.join("\n")}`,
    );
  }

  const forbiddenFile = packagedFiles.find(
    (path) =>
      forbiddenPrefixes.some((prefix) => path.startsWith(prefix)) ||
      /(^|\/)(\.env|.*secret.*|.*credential.*)$/i.test(path),
  );
  if (forbiddenFile) {
    throw new Error(`Forbidden file included in package: ${forbiddenFile}`);
  }

  const tarballPath = join(temporaryDirectory, packResult.filename);
  const consumerDirectory = join(temporaryDirectory, "consumer");
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--prefix",
      consumerDirectory,
      tarballPath,
    ],
    { cwd: root, stdio: "pipe" },
  );

  writeFileSync(
    join(consumerDirectory, "esm.mjs"),
    'import { PointerAssetsClient } from "@we-made/pointer-assets-client";\n' +
      'if (typeof PointerAssetsClient !== "function") process.exit(1);\n',
  );
  writeFileSync(
    join(consumerDirectory, "commonjs.cjs"),
    'const { PointerAssetsClient } = require("@we-made/pointer-assets-client");\n' +
      'if (typeof PointerAssetsClient !== "function") process.exit(1);\n',
  );
  writeFileSync(
    join(consumerDirectory, "types.ts"),
    'import { PointerAssetsClient, type Asset } from "@we-made/pointer-assets-client";\n' +
      "declare const client: PointerAssetsClient;\n" +
      "const asset: Promise<Asset> = client.get(\"asset-id\");\n" +
      "void asset;\n",
  );
  writeFileSync(
    join(consumerDirectory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
      },
      files: ["types.ts"],
    }),
  );

  execFileSync(process.execPath, ["esm.mjs"], {
    cwd: consumerDirectory,
    stdio: "pipe",
  });
  execFileSync(process.execPath, ["commonjs.cjs"], {
    cwd: consumerDirectory,
    stdio: "pipe",
  });
  execFileSync(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "--project",
      "tsconfig.json",
    ],
    { cwd: consumerDirectory, stdio: "pipe" },
  );

  const packageJson = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  console.log(
    `${packageJson.name}@${packageJson.version}: ${packResult.entryCount} files, ${packResult.size} bytes (${packResult.unpackedSize} unpacked)`,
  );
  console.log(packagedFiles.join("\n"));
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
