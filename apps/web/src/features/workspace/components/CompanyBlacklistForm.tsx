import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthSession } from "../../../services/auth.service";
import {
  addCompanyBlacklist,
  fetchCompanyBlacklist,
  removeCompanyBlacklist,
  fetchTrackingProfiles
} from "../../../services/tracking.service";
import { errorMessage } from "../../../errors";

export function CompanyBlacklistForm({ session, slug }: { session: AuthSession; slug: string }) {
  const client = useQueryClient();
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["company-blacklist", slug],
    queryFn: () => fetchCompanyBlacklist(session, slug)
  });
  const profiles = useQuery({
    queryKey: ["blacklist-profiles", slug],
    queryFn: () => fetchTrackingProfiles(session, slug)
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["company-blacklist", slug] }),
      client.invalidateQueries({ queryKey: ["application-eligibility", slug] })
    ]);
  };
  const add = useMutation({
    mutationFn: (input: { company: string; profileId: string | null; reason: string }) =>
      addCompanyBlacklist(session, slug, input),
    onSuccess: refresh
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeCompanyBlacklist(session, slug, id),
    onSuccess: refresh
  });
  const entries =
    query.data?.entries.filter(
      (entry) =>
        (scope === "all" ||
          (scope === "global"
            ? entry.profile_id === null
            : entry.profile_id === null || entry.profile_id === scope)) &&
        entry.company.toLowerCase().includes(search.toLowerCase())
    ) ?? [];
  return (
    <section className="panel">
      <h3>Company blacklist</h3>
      <p>
        Global entries block every profile in this workspace. Profile entries block only that
        profile. Matching ignores case, punctuation and legal suffixes. Add alternate company names
        separately.
      </p>
      <form
        className="modal-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          try {
            await add.mutateAsync({
              company: String(data.get("company")),
              profileId: String(data.get("profileId")) || null,
              reason: String(data.get("reason"))
            });
            form.reset();
          } catch {
            /* The mutation error is displayed below. */
          }
        }}
      >
        <label>
          Company
          <input name="company" required maxLength={250} disabled={add.isPending} />
        </label>
        <label>
          Applies to
          <select name="profileId" disabled={add.isPending || !profiles.data}>
            <option value="">Global — all profiles</option>
            {profiles.data?.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason (optional)
          <input
            name="reason"
            maxLength={2000}
            disabled={add.isPending}
            placeholder="Previous employer, company to avoid…"
          />
        </label>
        <button
          className="primary-action"
          type="submit"
          disabled={add.isPending || !profiles.data || !query.data}
        >
          {add.isPending ? "Adding…" : "Add to blacklist"}
        </button>
        {add.isSuccess ? <p role="status">Company added to blacklist.</p> : null}
      </form>
      <div className="modal-form">
        <label>
          View scope
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="all">All entries</option>
            <option value="global">Global only</option>
            {profiles.data?.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} (including global)
              </option>
            ))}
          </select>
        </label>
        <label>
          Search companies
          <input value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>
      {query.isPending ? (
        <p>Loading blacklist…</p>
      ) : query.data && !entries.length ? (
        <p>No blacklist entries match.</p>
      ) : null}
      {entries.length ? (
        <div className="table-wrap">
          <table className="tracking-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Scope</th>
                <th>Reason</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.company}</td>
                  <td>
                    {entry.profile_id
                      ? (profiles.data?.profiles.find((p) => p.id === entry.profile_id)?.name ??
                        "Former profile")
                      : "Global — all profiles"}
                  </td>
                  <td>{entry.reason || "—"}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary-action small"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(entry.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {query.error || profiles.error || add.error || remove.error ? (
        <p className="form-error" role="alert">
          {errorMessage(query.error ?? profiles.error ?? add.error ?? remove.error)}
        </p>
      ) : null}
    </section>
  );
}
