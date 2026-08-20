import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const blockedProjectRefs = [
  "xkhqdcxnllogiogahdmd",
  "dltvqlyfuoklkjujwcxv"
];

const inspectedValues = [
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PROJECT_REF,
  process.env.PROJECT_REF
].filter(Boolean);

const inspectedFiles = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  "supabase/.temp/project-ref",
  ".supabase/project-ref"
];

for (const relativePath of inspectedFiles) {
  const absolutePath = resolve(process.cwd(), relativePath);
  if (existsSync(absolutePath)) {
    inspectedValues.push(readFileSync(absolutePath, "utf8"));
  }
}

const joinedConfiguration = inspectedValues.join("\n").toLowerCase();
const blockedRef = blockedProjectRefs.find((projectRef) => joinedConfiguration.includes(projectRef));

if (blockedRef) {
  throw new Error(
    `Refusing local Supabase operation: configuration contains protected project ${blockedRef}.`
  );
}

const configuredUrls = inspectedValues
  .flatMap((value) => value.match(/https?:\/\/[^\s'\"]+/gi) ?? [])
  .map((value) => value.replace(/[),;]+$/, ""));

const nonLocalUrl = configuredUrls.find((value) => {
  try {
    const hostname = new URL(value).hostname;
    return hostname !== "127.0.0.1" && hostname !== "localhost";
  } catch {
    return true;
  }
});

if (nonLocalUrl) {
  throw new Error(
    `Refusing local Supabase operation: configured Supabase URL is not local (${nonLocalUrl}).`
  );
}

process.stdout.write("Local Supabase safety guard passed.\n");
