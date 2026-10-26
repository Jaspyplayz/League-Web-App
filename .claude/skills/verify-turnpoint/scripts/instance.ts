// The dev server launch.ts started, recorded per checkout (next dev allows one
// per checkout anyway), so cleanup.ts stops exactly that server and doctor.ts
// and drive.ts find it. Run from the repo root, like every script here.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { join, resolve } from "node:path";

export const INSTANCE_DIR = resolve(process.cwd(), ".cache/verify-turnpoint-server");
export const STATE_FILE = join(INSTANCE_DIR, "instance.json");

export type Instance = { pid: number; port: number; base: string; log: string; root: string };

export const nextBin = (root: string) => join(root, "node_modules/next/dist/bin/next");
export const serverArgs = (port: number) => ["dev", "-p", String(port), "-H", "127.0.0.1"];

// A file cut short by a crash counts as no file, and the next launch replaces it.
export function readInstance(): Instance | undefined {
  if (!existsSync(STATE_FILE)) return undefined;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as Instance;
  } catch {
    return undefined;
  }
}

// The state file outlives its server after a crash, a reboot or a session that
// ended first, and the OS hands its PID to new processes. So the PID is our
// server only while it still runs this checkout's next dev on the recorded port.
export function isOurs({ pid, port, root }: Instance): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(port)) return false;
  // Windows quotes the arguments that hold spaces.
  const line = commandLine(pid)?.replace(/"/g, "");
  if (!line) return false;
  const ours = [nextBin(root), ...serverArgs(port)].join(" ");
  return process.platform === "win32" ? line.toLowerCase().includes(ours.toLowerCase()) : line.includes(ours);
}

function commandLine(pid: number): string | undefined {
  try {
    if (process.platform === "win32") {
      const query = `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`;
      return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", query], { encoding: "utf8", windowsHide: true });
    }
    if (process.platform === "linux") return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ");
    return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
  } catch {
    return undefined;
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function portAnswers(port: number): Promise<boolean> {
  return new Promise((answer) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      answer(true);
    });
    socket.once("error", () => answer(false));
  });
}

export const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
