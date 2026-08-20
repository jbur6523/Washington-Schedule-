import { existsSync, readFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supabaseDirectory = resolve(repositoryRoot, "supabase");
const migrationsDirectory = resolve(supabaseDirectory, "migrations");
const heldMigrationsDirectory = resolve(supabaseDirectory, ".local-migrations-hold");
const seedPath = resolve(supabaseDirectory, "seed.sql");
const heldSeedPath = resolve(supabaseDirectory, ".local-seed-hold.sql");
const bootstrapPath = resolve(supabaseDirectory, "local", "bootstrap-before-leadership.sql");
const localProjectId = "whhs-schedule-local";
const localDatabaseContainer = `supabase_db_${localProjectId}`;

for (const target of [
  migrationsDirectory,
  heldMigrationsDirectory,
  seedPath,
  heldSeedPath,
  bootstrapPath
]) {
  if (!target.startsWith(`${supabaseDirectory}\\`) && !target.startsWith(`${supabaseDirectory}/`)) {
    throw new Error(`Refusing local setup because a resolved path escaped the Supabase directory: ${target}`);
  }
}

function runSupabase(args, options = {}) {
  const cliEntryPoint = resolve(repositoryRoot, "node_modules", "supabase", "dist", "supabase.js");
  const result = spawnSync(process.execPath, [cliEntryPoint, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });

  if (options.capture) {
    return result;
  }

  if (result.status !== 0) {
    throw new Error(
      `Supabase command failed: supabase ${args.join(" ")}${result.error ? ` (${result.error.message})` : ""}`
    );
  }

  return result;
}

function localStackIsRunning() {
  const result = runSupabase(["status", "--output", "json"], { capture: true });
  return result.status === 0;
}

function runLocalSqlFile(filePath) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      localDatabaseContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1"
    ],
    {
      cwd: repositoryRoot,
      input: readFileSync(filePath),
      stdio: ["pipe", "inherit", "inherit"]
    }
  );

  if (result.status !== 0) {
    throw new Error(`Local SQL file failed: ${filePath}`);
  }
}

function startEmptyLocalStack() {
  if (existsSync(heldMigrationsDirectory) || existsSync(heldSeedPath)) {
    throw new Error("Refusing local setup because a previous migration hold directory/file still exists.");
  }

  runSupabase(["stop", "--project-id", localProjectId, "--no-backup"], { capture: true });

  renameSync(migrationsDirectory, heldMigrationsDirectory);
  if (existsSync(seedPath)) {
    renameSync(seedPath, heldSeedPath);
  }

  try {
    runSupabase(["start"]);
  } finally {
    renameSync(heldMigrationsDirectory, migrationsDirectory);
    if (existsSync(heldSeedPath)) {
      renameSync(heldSeedPath, seedPath);
    }
  }
}

if (!localStackIsRunning()) {
  startEmptyLocalStack();
}

// A tracked historical migration expects one legacy staff identity to exist.
// Rebuild only through the migration immediately before that dependency,
// insert the documented local-only compatibility fixture, then continue.
runSupabase(["db", "reset", "--local", "--version", "202608090001", "--no-seed"]);
runLocalSqlFile(bootstrapPath);
runSupabase(["migration", "up", "--local", "--include-all"]);
runLocalSqlFile(seedPath);

process.stdout.write("WHHS local Supabase is ready with synthetic data.\n");
