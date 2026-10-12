import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthSession } from "../../../services/auth.service";
import { fetchApplicationRules, saveApplicationRules } from "../../../services/tracking.service";
import { errorMessage } from "../../../errors";

export function ApplicationRulesForm({ session, slug }: { session: AuthSession; slug: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["application-rules", slug],
    queryFn: () => fetchApplicationRules(session, slug)
  });
  const save = useMutation({
    mutationFn: (input: { cooldownDays: number; timeZone: string }) =>
      saveApplicationRules(session, slug, input),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["application-rules", slug] }),
        client.invalidateQueries({ queryKey: ["application-eligibility", slug] })
      ]);
    }
  });
  return (
    <section className="panel">
      <h3>Application rules</h3>
      <p>
        Warn about the same company for the same profile across all bidders. Imported records are
        pending until marked applied. Eligibility badges appear only on the workspace's import day.
      </p>
      {query.data ? (
        <form
          key={`${query.data.cooldownDays}:${query.data.timeZone}`}
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            save.mutate({
              cooldownDays: Number(data.get("cooldownDays")),
              timeZone: String(data.get("timeZone"))
            });
          }}
        >
          <label>
            Company cooldown (days)
            <input
              name="cooldownDays"
              type="number"
              min="1"
              max="3650"
              step="1"
              required
              defaultValue={query.data.cooldownDays}
              disabled={save.isPending}
            />
          </label>
          <label>
            Workspace time zone
            <input
              name="timeZone"
              required
              defaultValue={query.data.timeZone}
              placeholder="America/Chicago"
              disabled={save.isPending}
            />
          </label>
          <button className="primary-action" disabled={save.isPending} type="submit">
            Save application rules
          </button>
          {save.isSuccess ? <p role="status">Application rules saved.</p> : null}
        </form>
      ) : (
        <p>Loading application rules…</p>
      )}
      {query.error || save.error ? (
        <p className="form-error" role="alert">
          {errorMessage(query.error ?? save.error)}
        </p>
      ) : null}
    </section>
  );
}
