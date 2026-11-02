// The ticket queue's script (JAS-144, .github/workflows/run-queue.yml). It
// reads Linear and GitHub, plans the round, and carries it out: comments and
// moves in Linear, and one fire of the cloud task per picked ticket. Every
// decision is in scripts/run-queue-rest.ts; this file only reads the
// environment and talks to Linear, GitHub and the cloud task.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fireAnswer, fireRequest, linearWrites, oneLine, planRound, readSnapshot, runRound, type FireAnswer } from "./run-queue-rest";

// Prints which setting is missing, never a value.
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} isn't set. The Run queue workflow sets it (.github/workflows/run-queue.yml).`);
    process.exit(1);
  }
  return value;
}

const dryRun = process.env.DRY_RUN === "true";
const repo = required("GH_REPO");
const taskId = required("RUN_QUEUE_TASK_ID");
if (!/^trig_[A-Za-z0-9]+$/.test(taskId)) {
  console.error("RUN_QUEUE_TASK_ID isn't a cloud task ID like trig_01...");
  process.exit(1);
}
const linearKey = required("LINEAR_API_KEY");
// A dry run never reads the token, even if one is set, so it can't start a builder.
const taskToken = dryRun ? "" : required("RUN_QUEUE_TASK_TOKEN");

const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: runId, GITHUB_EVENT_NAME: eventName } = process.env;
const runUrl = server && repository && runId ? `${server}/${repository}/actions/runs/${runId}` : "(a run outside GitHub Actions)";

// The step summary is the box on the run's page, so what the round did is easy to find.
function summary(line: string) {
  console.log(line);
  const file = process.env.GITHUB_STEP_SUMMARY;
  // Markdown joins lines with one line break between them into one paragraph.
  if (file) appendFileSync(file, `${line}\n\n`);
}

async function linear(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    // Linear takes a personal API key as it is, with no "Bearer".
    headers: { "content-type": "application/json", Authorization: linearKey },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  // Linear answers a GraphQL error with JSON too, even with an error status,
  // and run-queue-rest.ts throws on its errors.
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Linear answered HTTP ${response.status} with something that isn't JSON.`);
  }
}

function github(path: string): unknown {
  try {
    // A PR's file list holds each file's diff, so it can pass Node's default 1 MB.
    const output = execFileSync("gh", ["api", "--paginate", "--slurp", path], {
      encoding: "utf8",
      // Only what gh needs, so it never holds the Linear key or the task
      // token. NODE_ENV is there because Next's types require it in any
      // environment; it holds no secret.
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, HOME: process.env.HOME, GH_TOKEN: process.env.GH_TOKEN, GH_REPO: process.env.GH_REPO },
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(output);
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    throw new Error(`gh api ${path} failed: ${oneLine(String(stderr || error), 300)}`);
  }
}

async function fire(ticketId: string): Promise<FireAnswer> {
  const request = fireRequest(taskId, ticketId);
  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: { ...request.headers, Authorization: `Bearer ${taskToken}` },
      body: request.body,
      signal: AbortSignal.timeout(30_000),
    });
    return fireAnswer(response.status, await response.text());
  } catch (error) {
    // A timeout or a dropped connection: the task may have started a session anyway.
    return { kind: "no answer", why: oneLine(error instanceof Error ? error.message : String(error), 300) };
  }
}

async function main() {
  console.log(`Woken by ${oneLine(eventName ?? "a person, outside GitHub Actions", 40)}.`);
  const snapshot = await readSnapshot(repo, linear, github);
  const plan = planRound(snapshot, new Date(), runUrl, { byName: eventName === "workflow_dispatch" });
  const { failed } = await runRound(plan, { dryRun }, {
    ...linearWrites(linear, snapshot.readyStateId),
    fire,
    log: (line) => console.log(line),
    summary,
  });
  if (failed) process.exit(1);
}

// One line with the script's own words first, so an error's text can't
// start a line of its own in the log.
main().catch((error: unknown) => {
  console.error(`The queue stopped: ${oneLine(error instanceof Error ? error.message : String(error), 500)}`);
  process.exit(1);
});
