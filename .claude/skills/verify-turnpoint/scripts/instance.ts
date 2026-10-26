// The dev server launch.ts started, recorded per checkout (next dev allows one
// per checkout anyway), so cleanup.ts stops exactly that server and doctor.ts
// and drive.ts find it. Run from the repo root, like every script here.

import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { join, resolve } from "node:path";

export const INSTANCE_DIR = resolve(process.cwd(), ".cache/verify-turnpoint-server");
export const STATE_FILE = join(INSTANCE_DIR, "instance.json");

export type Instance = { pid: number; port: number; base: string; log: string; root: string };

export function readInstance(): Instance | undefined {
  if (!existsSync(STATE_FILE)) return undefined;
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as Instance;
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
