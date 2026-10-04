import { execFileSync } from "node:child_process";
import path from "node:path";

const IMAGE = "pm-app-e2e";
const CONTAINER = "pm-app-e2e";
export const E2E_PORT = 8011;

const docker = (...args: string[]) =>
  execFileSync("docker", args, { stdio: "inherit" });

/**
 * Builds the real Docker image and runs it with a fresh, throwaway database,
 * so the e2e suite exercises the actual FastAPI backend, SQLite, and static build.
 * Set E2E_BASE_URL to test an already-running server instead.
 */
export default async function globalSetup() {
  if (process.env.E2E_BASE_URL) {
    return;
  }

  docker("build", "-t", IMAGE, path.resolve(__dirname, "../.."));
  execFileSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
  // No OPENROUTER_API_KEY: chat requests fail with 502 unless a test fakes them.
  docker("run", "-d", "--name", CONTAINER, "-p", `${E2E_PORT}:8000`, IMAGE);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${E2E_PORT}/api/health`);
      if (response.ok) {
        break;
      }
    } catch {
      // Not accepting connections yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return () => {
    execFileSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
  };
}
