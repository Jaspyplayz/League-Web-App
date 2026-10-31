import type { Region } from "@/lib/regions";
import { getPlatformStatus } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import { currentIssues } from "@/lib/riot-status";
import { NoteBox } from "./ui/state-panel";

// When Riot doesn't answer, check Riot's own status page for that server, so
// the visitor learns whether it's a known outage. Shows nothing if the status
// page has nothing to report or can't be reached either. The note is Riot's
// own words, so it sits in a raised box inside the problem panel.
export async function RiotStatus({ region }: { region: Region }) {
  const status = await settle(getPlatformStatus(region));
  if (!status.ok) return null;
  const issues = currentIssues(status.value);
  if (issues.length === 0) return null;

  return (
    <NoteBox>
      <p>Riot is reporting problems on this server right now:</p>
      <ul className="mt-1 list-disc pl-5">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </NoteBox>
  );
}
