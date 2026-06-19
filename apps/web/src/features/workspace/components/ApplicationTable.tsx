import type { JobApplication, JobMarket, Profile } from "@rghs1/domain";
import { StatusPill } from "../../../components/shared/StatusPill";
import { displayDate } from "../../../utils/datetime";
import { marketName, profileName } from "../workspace-display";

export function ApplicationTable({
  applications,
  profiles,
  markets
}: {
  applications: JobApplication[];
  profiles: Profile[];
  markets: JobMarket[];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Profile</th>
            <th>Market</th>
            <th>Status</th>
            <th>Applied</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((application) => (
            <tr key={application.id}>
              <td>
                <strong>{application.jobTitle}</strong>
                <span>{application.companyName}</span>
              </td>
              <td>{profileName(profiles, application.profileId)}</td>
              <td>{marketName(markets, application.marketId)}</td>
              <td>
                <StatusPill value={application.status} />
              </td>
              <td>{displayDate(application.appliedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
