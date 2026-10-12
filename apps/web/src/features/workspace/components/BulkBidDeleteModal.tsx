import { useRef, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { Modal } from "../../../components/shared/Modal";
import { errorMessage } from "../../../errors";
import type { AuthSession } from "../../../services/auth.service";
import {
  bulkDeleteBids,
  previewBulkDeleteBids,
  type BulkBidDeleteFilter,
  type BulkBidDeletePreview,
  type TrackingProfile
} from "../../../services/tracking.service";
import { deviceTimeZone, displayDate } from "../../../utils/datetime";
import { bulkBidDeleteDateFilter } from "../bulk-bid-delete";

export function BulkBidDeleteModal({
  session,
  slug,
  profiles,
  initialProfileId,
  onClose,
  onDeleted
}: {
  session: AuthSession;
  slug: string;
  profiles: TrackingProfile[];
  initialProfileId?: string;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [profileId, setProfileId] = useState(initialProfileId ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<BulkBidDeletePreview | null>(null);
  const [reviewedFilter, setReviewedFilter] = useState<BulkBidDeleteFilter | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function clearPreview() {
    setPreview(null);
    setReviewedFilter(null);
    setSelectedIds([]);
    setConfirmed(false);
    setError(null);
    setResult(null);
  }

  async function loadPreview() {
    const filter = bulkBidDeleteDateFilter(profileId, from, to);
    if (!filter) {
      setError("Select a profile and a valid start/end date range.");
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    clearPreview();
    try {
      const data = await previewBulkDeleteBids(session, slug, filter);
      setPreview(data);
      setReviewedFilter(filter);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (lock.current || !confirmed || !reviewedFilter || !selectedIds.length) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await bulkDeleteBids(session, slug, {
        filter: reviewedFilter,
        bidIds: selectedIds
      });
      setResult(
        `${data.deleted} bid${data.deleted === 1 ? "" : "s"} deleted.${data.skipped ? ` ${data.skipped} changed records were skipped.` : ""} Preview again to review remaining matches.`
      );
      setPreview(null);
      setReviewedFilter(null);
      setSelectedIds([]);
      setConfirmed(false);
    } catch (err) {
      setError(errorMessage(err));
      setConfirmed(false);
    } finally {
      try {
        await onDeleted();
      } finally {
        lock.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <Modal
      title="Bulk delete bids"
      size="large"
      onClose={() => {
        if (!lock.current) onClose();
      }}
    >
      <div className="modal-form">
        <p>
          Find bids you created by profile and bid date. Both dates are included, using{" "}
          {deviceTimeZone()}.
        </p>
        <p>
          Deletion removes the whole bid from tracking, including bids assigned to multiple
          profiles. Linked interviews and historical records are preserved.
        </p>
        <div className="form-grid">
          <label>
            Profile
            <select
              value={profileId}
              disabled={busy}
              onChange={(e) => {
                setProfileId(e.target.value);
                clearPreview();
              }}
            >
              <option value="">Select a profile</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                  {profile.deletedAt ? " (deleted profile)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            From bid date
            <input
              type="date"
              value={from}
              disabled={busy}
              onChange={(e) => {
                setFrom(e.target.value);
                clearPreview();
              }}
            />
          </label>
          <label>
            Through bid date
            <input
              type="date"
              value={to}
              min={from || undefined}
              disabled={busy}
              onChange={(e) => {
                setTo(e.target.value);
                clearPreview();
              }}
            />
          </label>
        </div>
        <button
          type="button"
          className="secondary-action"
          disabled={busy || !profileId || !from || !to}
          onClick={() => void loadPreview()}
        >
          {busy ? <LoaderCircle className="spin-icon" aria-hidden="true" /> : null} Preview matching
          bids
        </button>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {result ? <p role="status">{result}</p> : null}
        {preview ? (
          <>
            <p role="status">
              {preview.bids.length} eligible bids in this preview.{" "}
              {preview.hasMore
                ? "More match: process up to 200 at a time, then preview again."
                : ""}
            </p>
            {preview.bids.length ? (
              <>
                <label className="bulk-delete-choice">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={selectedIds.length === preview.bids.length}
                    onChange={(e) => {
                      setSelectedIds(e.target.checked ? preview.bids.map((bid) => bid.id) : []);
                      setConfirmed(false);
                    }}
                  />{" "}
                  Select all {preview.bids.length} previewed bids
                </label>
                <div className="table-wrap bulk-delete-preview">
                  <table className="tracking-table">
                    <thead>
                      <tr>
                        <th>Select</th>
                        <th>Company</th>
                        <th>Job title</th>
                        <th>Bid date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.bids.map((bid) => (
                        <tr key={bid.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select ${bid.company} ${bid.jobTitle}`}
                              checked={selectedIds.includes(bid.id)}
                              disabled={busy}
                              onChange={(e) => {
                                setSelectedIds((ids) =>
                                  e.target.checked
                                    ? [...ids, bid.id]
                                    : ids.filter((id) => id !== bid.id)
                                );
                                setConfirmed(false);
                              }}
                            />
                          </td>
                          <td>{bid.company}</td>
                          <td>{bid.jobTitle}</td>
                          <td>{displayDate(bid.bidAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="bulk-delete-choice">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy || !selectedIds.length}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I confirm deletion of {selectedIds.length} selected bids.
                </label>
                <button
                  type="button"
                  className="danger-action"
                  disabled={busy || !confirmed || !selectedIds.length}
                  onClick={() => void removeSelected()}
                >
                  {busy ? (
                    <LoaderCircle className="spin-icon" aria-hidden="true" />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}{" "}
                  Delete {selectedIds.length} selected bids
                </button>
              </>
            ) : (
              <p>No eligible bids match. Only your own active bids can be deleted.</p>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
