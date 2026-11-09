import { useRef, useState } from "react";
import { Modal } from "../../../components/shared/Modal";
import { errorMessage } from "../../../errors";
import type { AuthSession } from "../../../services/auth.service";
import { fetchPendingBidExport } from "../../../services/tracking.service";
import { downloadPendingBids } from "../pending-bid-export";

type Option = { id: string; name: string };

export function PendingBidExportModal({
  session,
  slug,
  members,
  profiles,
  initialMemberId,
  initialProfileId,
  onClose
}: {
  session: AuthSession;
  slug: string;
  members: Option[];
  profiles: Option[];
  initialMemberId?: string;
  initialProfileId?: string;
  onClose: () => void;
}) {
  const [memberIds, setMemberIds] = useState<string[]>(initialMemberId ? [initialMemberId] : []);
  const [profileIds, setProfileIds] = useState<string[]>(
    initialProfileId ? [initialProfileId] : []
  );
  const [allMembers, setAllMembers] = useState(false);
  const [allProfiles, setAllProfiles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const valid = (allMembers || memberIds.length > 0) && (allProfiles || profileIds.length > 0);
  const names = (options: Option[], ids: string[]) =>
    options
      .filter((item) => ids.includes(item.id))
      .map((item) => item.name)
      .join(", ");

  async function exportFile() {
    if (!valid || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const { records } = await fetchPendingBidExport(session, slug, {
        memberIds: allMembers ? undefined : memberIds,
        profileIds: allProfiles ? undefined : profileIds
      });
      if (!records.length) {
        setError("No pending applications match these selections.");
        return;
      }
      await downloadPendingBids(records);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Export pending applications"
      onClose={() => {
        if (!lock.current) onClose();
      }}
    >
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          void exportFile();
        }}
      >
        <p>
          Choose bidders and profiles. Matches must satisfy both filters. All matching pages will be
          exported.
        </p>
        <ExportSelection
          label="Bidders"
          options={members}
          selected={memberIds}
          onChange={setMemberIds}
          all={allMembers}
          onAll={setAllMembers}
          disabled={busy}
        />
        <ExportSelection
          label="Profiles"
          options={profiles}
          selected={profileIds}
          onChange={setProfileIds}
          all={allProfiles}
          onAll={setAllProfiles}
          disabled={busy}
        />
        <div aria-live="polite">
          <p>
            <strong>Bidders:</strong>{" "}
            {allMembers ? "All bidders" : names(members, memberIds) || "Choose bidders"}
          </p>
          <p>
            <strong>Profiles:</strong>{" "}
            {allProfiles ? "All profiles" : names(profiles, profileIds) || "Choose profiles"}
          </p>
        </div>
        <p>
          Pending applications only. Applied, expired, deleted, and blacklisted records are
          excluded. Excel columns: job title, company, link.
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button className="secondary-action" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary-action" type="submit" disabled={!valid || busy}>
            {busy ? "Preparing export…" : "Export (.xlsx)"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ExportSelection({
  label,
  options,
  selected,
  onChange,
  all,
  onAll,
  disabled
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (ids: string[]) => void;
  all: boolean;
  onAll: (all: boolean) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const visible = options.filter((option) =>
    option.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  );
  return (
    <fieldset disabled={disabled} className="export-selection">
      <legend>{label}</legend>
      <details>
        <summary>
          {all
            ? `All ${label.toLowerCase()}`
            : selected.length
              ? `${selected.length} selected`
              : `Choose ${label.toLowerCase()}`}
        </summary>
        <div className="export-selection-options">
          <input
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder={`Search ${label.toLowerCase()}…`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={all}
              onChange={(event) => onAll(event.target.checked)}
            />
            All {label.toLowerCase()}
          </label>
          {visible.map((option) => (
            <label key={option.id}>
              <input
                type="checkbox"
                disabled={all}
                checked={all || selected.includes(option.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, option.id]
                      : selected.filter((id) => id !== option.id)
                  )
                }
              />
              {option.name}
            </label>
          ))}
          {!visible.length ? <p>No matches.</p> : null}
        </div>
      </details>
    </fieldset>
  );
}
