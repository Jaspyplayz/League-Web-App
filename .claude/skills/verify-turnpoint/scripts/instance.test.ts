import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isAlive, portAnswers } from "./instance";

const SCRIPTS = resolve(".claude/skills/verify-turnpoint/scripts");
const TSX = resolve("node_modules/tsx/dist/cli.mjs");

// Each test gets a checkout of its own, whose next binary is a stand-in that
// works like next dev: it forks a child that serves the home page on the -p
// port and logs "Ready in". So stopping only the parent leaves the port taken.
const FAKE_NEXT = `if (process.argv[2] === "serve") {
  require("node:http").createServer((_, res) => res.end("Look up any player by Riot ID")).listen(Number(process.argv[3]), "127.0.0.1", () => console.log("Ready in 1ms"));
} else {
  require("node:child_process").fork(__filename, ["serve", process.argv[process.argv.indexOf("-p") + 1]]);
}
`;

const roots: string[] = [];
const children: ChildProcess[] = [];

function checkout() {
  const root = mkdtempSync(join(tmpdir(), "verify-turnpoint-"));
  const next = join(root, "node_modules/next/dist/bin/next");
  mkdirSync(dirname(next), { recursive: true });
  writeFileSync(next, FAKE_NEXT);
  roots.push(root);
  return { root, next };
}

const stateFile = (root: string) => join(root, ".cache/verify-turnpoint-server/instance.json");

function record(root: string, pid: number, port: number) {
  mkdirSync(dirname(stateFile(root)), { recursive: true });
  const log = join(dirname(stateFile(root)), `dev-${port}.log`);
  writeFileSync(stateFile(root), JSON.stringify({ pid, port, base: `http://127.0.0.1:${port}`, log, root }));
}

// Vitest sets BASE_URL to "/", which would pick the target before the state file.
function run(script: string, root: string, ...args: string[]) {
  const env = { ...process.env, BASE_URL: undefined };
  const result = spawnSync(process.execPath, [TSX, join(SCRIPTS, script), ...args], { cwd: root, encoding: "utf8", env });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

async function freePort(): Promise<number> {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  server.close();
  return port;
}

// Detached only for the process group stopTree stops on Linux and macOS. On
// Windows a detached stand-in has no console, so its worker would open a window.
function start(command: string[], cwd: string) {
  const child = spawn(process.execPath, command, { cwd, stdio: "ignore", detached: process.platform !== "win32", windowsHide: true });
  children.push(child);
  return child;
}

async function listening(port: number) {
  for (let tries = 0; tries < 50 && !(await portAnswers(port)); tries++) await new Promise((r) => setTimeout(r, 100));
}

function stopTree(pid: number) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

// How many processes pid and those under it are, and which of them own a
// visible window. Throws when it can't look, so a blocked Add-Type can't pass.
function windowsOf(pid: number): { tree: number; owners: string } {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -Namespace W -Name U -MemberDefinition '
  public delegate bool P(System.IntPtr h, System.IntPtr l);
  [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(P p, System.IntPtr l);
  [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
  [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);'
$all = Get-CimInstance Win32_Process
$tree = @(${pid})
do { $n = $tree.Count; $tree = @($tree + @($all | Where-Object { $tree -contains $_.ParentProcessId } | ForEach-Object ProcessId) | Sort-Object -Unique) } while ($tree.Count -gt $n)
$owners = New-Object System.Collections.Generic.List[uint32]
[void][W.U]::EnumWindows({ param($h) if ([W.U]::IsWindowVisible($h)) { $p = [uint32]0; [void][W.U]::GetWindowThreadProcessId($h, [ref]$p); $owners.Add($p) }; $true }, [IntPtr]::Zero)
"tree $($tree.Count)"
$owners | Where-Object { $tree -contains $_ }`;
  const { status, stdout, stderr } = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true });
  if (status !== 0 || stderr.trim()) throw new Error(`could not list windows (exit ${status}): ${stderr}`);
  const [tree, ...owners] = stdout.trim().split(/\r?\n/);
  return { tree: Number(tree.replace("tree ", "")), owners: owners.join(",") };
}

afterEach(() => {
  for (const root of roots) if (existsSync(stateFile(root))) run("cleanup.ts", root);
  for (const child of children.splice(0)) stopTree(child.pid!);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

describe("the state file launch.ts writes", () => {
  it("launch starts a server, refuses a second one, and cleanup stops it", async () => {
    const { root } = checkout();
    const port = await freePort();
    const first = run("launch.ts", root, String(port));
    expect(first.out).toContain(`ready: http://127.0.0.1:${port}`);
    expect(first.code).toBe(0);

    const second = run("launch.ts", root, String(await freePort()));
    expect(second.out).toContain("an instance from an earlier run is still up");
    expect(second.code).toBe(1);

    const cleanup = run("cleanup.ts", root);
    expect(cleanup.out).toMatch(new RegExp(`stopped pid \\d+ and its children, port ${port} free`));
    expect(cleanup.code).toBe(0);
    expect(await portAnswers(port)).toBe(false);
    expect(existsSync(stateFile(root))).toBe(false);
  });

  // Windows Terminal opens a window for each console a process gets without
  // windowsHide, and next dev forks its worker without it.
  it.runIf(process.platform === "win32")("launch opens no window on Windows", async () => {
    const { root } = checkout();
    const port = await freePort();
    expect(run("launch.ts", root, String(port)).code).toBe(0);
    const { pid } = JSON.parse(readFileSync(stateFile(root), "utf8"));
    const { tree, owners } = windowsOf(pid);
    // The keeper, the stand-in next and its worker at least.
    expect(tree).toBeGreaterThanOrEqual(3);
    expect(owners).toBe("");
  });

  // A state file outlives its server after a crash, a reboot or a session that
  // ended first, and the OS hands the PID to a new process.
  it("cleanup leaves alone a process that took over the recorded PID", async () => {
    const { root } = checkout();
    const other = start(["-e", "setInterval(() => {}, 1000)"], root);
    record(root, other.pid!, await freePort());

    const { code, out } = run("cleanup.ts", root);
    expect(out).toContain(`nothing stopped: pid ${other.pid} no longer runs the server launch.ts started`);
    expect(code).toBe(0);
    expect(isAlive(other.pid!)).toBe(true);
    expect(existsSync(stateFile(root))).toBe(false);
  });

  // Such as Jasper's own next dev, in the main checkout or in this one.
  it.each([
    { what: "another checkout's next dev", sameCheckout: false },
    { what: "this checkout's next dev on another port", sameCheckout: true },
  ])("cleanup leaves alone $what that took over the recorded PID", async ({ sameCheckout }) => {
    const ours = checkout();
    const theirs = sameCheckout ? ours : checkout();
    const port = await freePort();
    const server = start([theirs.next, "dev", "-p", String(port), "-H", "127.0.0.1"], theirs.root);
    await listening(port);
    record(ours.root, server.pid!, sameCheckout ? await freePort() : port);

    const { code, out } = run("cleanup.ts", ours.root);
    expect(out).toContain("nothing stopped");
    expect(code).toBe(0);
    expect(isAlive(server.pid!)).toBe(true);
    expect(await portAnswers(port)).toBe(true);
  });

  it("drive.ts refuses a state file whose server is no longer ours", async () => {
    const { root } = checkout();
    const other = start(["-e", "setInterval(() => {}, 1000)"], root);
    record(root, other.pid!, await freePort());

    const { code, out } = run("drive.ts", root, "home-lookup");
    expect(out).toContain("is no longer the one launch.ts started");
    expect(code).toBe(1);
  });

  it("launch starts a new server when the recorded PID belongs to another process", async () => {
    const { root } = checkout();
    const other = start(["-e", "setInterval(() => {}, 1000)"], root);
    record(root, other.pid!, await freePort());

    const port = await freePort();
    const { code, out } = run("launch.ts", root, String(port));
    expect(out).toContain(`ready: http://127.0.0.1:${port}`);
    expect(code).toBe(0);
    expect(isAlive(other.pid!)).toBe(true);
  });
}, 60_000);
