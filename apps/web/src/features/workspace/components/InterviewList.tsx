import type { Interview, Profile } from "@rghs1/domain";
import { StatusPill } from "../../../components/shared/StatusPill";
import { displayDate } from "../../../utils/datetime";
import { profileName } from "../workspace-display";

export function InterviewList({
  interviews,
  profiles
}: {
  interviews: Interview[];
  profiles: Profile[];
}) {
  return (
    <div className="stack-list">
      {interviews.map((interview) => (
        <article className="interview-item" key={interview.id}>
          <div>
            <strong>{profileName(profiles, interview.profileId)}</strong>
            <span>
              {interview.interviewType} - {displayDate(interview.scheduledAt)}
            </span>
          </div>
          <StatusPill value={interview.status} />
        </article>
      ))}
    </div>
  );
}
