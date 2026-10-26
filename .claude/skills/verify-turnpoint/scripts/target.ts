import { previewUrl } from "../../../../scripts/preview";
import { readInstance, type Instance } from "./instance";

// `preview` is the only origin that may get the bypass secret: the one Vercel
// reported for --pr. A --base URL never gets it. `instance` is set when the
// base came from launch.ts's state file, so callers can check it's still ours.
export type Target = { base: string; preview?: string; instance?: Instance };

export function pickTarget(
  { pr, base }: { pr?: string; base?: string },
  findPreview: (pr: string) => string = previewUrl,
): Target | { error: string } {
  if (pr && base) return { error: "Pass --pr or --base, not both." };
  if (pr) {
    const preview = new URL(findPreview(pr)).origin;
    return { base: preview, preview };
  }
  const chosen = base ?? process.env.BASE_URL;
  if (chosen) return { base: chosen.replace(/\/$/, "") };
  const instance = readInstance();
  if (!instance) return { error: "No target. Run launch.ts first, or pass --pr <number> or --base https://league-web-app.vercel.app" };
  return { base: instance.base, instance };
}
