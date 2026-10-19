import type { Region } from "@/lib/regions";
import { getPlatformStatus } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import { currentIssues } from "@/lib/riot-status";

// When Riot doesn't answer, check Riot's own status page for that server, so
// the visitor learns whether it's a known outage. Shows nothing if the status
// page has nothing to report or can't be reached either.
export async function RiotStatus({ region }: { region: Region }) {
  const status = await settle(getPlatformStatus(region));
  if (!status.ok) return null;
  const issues = currentIssues(status.value);
  if (issues.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted">Riot is reporting problems on this server right now:</p>
      <ul className="list-disc pl-5 text-muted">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </div>
  );
}
