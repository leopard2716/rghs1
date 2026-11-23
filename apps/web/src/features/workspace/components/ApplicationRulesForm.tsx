import { useState } from "react";
import type { CompanyReset } from "@rghs1/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthSession } from "../../../services/auth.service";
import {
  fetchApplicationRules,
  saveApplicationRules,
  type ApplicationRules
} from "../../../services/tracking.service";
import { errorMessage } from "../../../errors";

export function ApplicationRulesForm({ session, slug }: { session: AuthSession; slug: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["application-rules", slug],
    queryFn: () => fetchApplicationRules(session, slug)
  });
  const save = useMutation({
    mutationFn: (input: ApplicationRules) => saveApplicationRules(session, slug, input),
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
          key={JSON.stringify(query.data)}
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const days = data.getAll("resetDays");
            save.mutate({
              companyResets: data
                .getAll("resetCompany")
                .map((name, i) => ({ company: String(name).trim(), days: Number(days[i]) })),
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
          <CompanyResetFields initial={query.data.companyResets ?? []} disabled={save.isPending} />
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

function CompanyResetFields({ initial, disabled }: { initial: CompanyReset[]; disabled: boolean }) {
  const [rows, setRows] = useState(() => initial.map((rule, i) => ({ ...rule, key: String(i) })));
  return (
    <fieldset disabled={disabled}>
      <legend>Company reset periods</legend>
      <p>
        For these companies, each profile must wait the specified number of days from its last
        application, even after rejection. Other companies use the default cooldown.
      </p>
      {rows.map((row) => (
        <div className="modal-form" key={row.key}>
          <label>
            Company
            <input name="resetCompany" required maxLength={250} defaultValue={row.company} />
          </label>
          <label>
            Reset period (days)
            <input
              name="resetDays"
              type="number"
              min={1}
              max={3650}
              required
              defaultValue={row.days}
            />
          </label>
          <button type="button" onClick={() => setRows(rows.filter((r) => r.key !== row.key))}>
            Remove company rule
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows([...rows, { key: crypto.randomUUID(), company: "", days: 30 }])}
      >
        Add company rule
      </button>
    </fieldset>
  );
}
