import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Pencil, Plus, ReceiptText, RefreshCw, Save, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Modal } from "../../../components/shared/Modal";
import { errorMessage } from "../../../errors";
import type { AuthSession } from "../../../services/auth.service";
import {
  createCustomPaymentRecord,
  deleteCustomPaymentRecord,
  fetchPaymentLedger,
  updateCustomPaymentRecord,
  type PaymentLedgerDirection,
  type PaymentLedgerQuery,
  type PaymentLedgerRecord,
  type TrackingMemberSummary
} from "../../../services/tracking.service";
import type { WorkspaceSession } from "../../../services/workspace.service";
import { displayDate } from "../../../utils/datetime";
import { fieldValue } from "../../../utils/form";
import { WorkspaceShell } from "./WorkspaceShell";

type LedgerRangePreset = "thisMonth" | "lastMonth" | "thisYear" | "custom";

type LedgerControls = {
  memberId?: string;
  range: LedgerRangePreset;
  customDateFrom: string;
  customDateTo: string;
};

type CustomFormState =
  | {
      mode: "create";
    }
  | {
      mode: "edit";
      record: PaymentLedgerRecord;
    };

export function PaymentLedgerPage({
  session,
  workspaceSession,
  onRecoverPassword,
  onSignOut
}: {
  session: AuthSession;
  workspaceSession: WorkspaceSession;
  onRecoverPassword: () => void;
  onSignOut: () => void;
}) {
  const slug = workspaceSession.workspace.slug;
  const memberId = workspaceSession.member.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsValue = searchParams.toString();
  const controls = useMemo(
    () => ledgerControlsFromParams(new URLSearchParams(searchParamsValue)),
    [searchParamsValue]
  );
  const ledgerRequest = useMemo(() => paymentLedgerRequest(controls), [controls]);
  const queryClient = useQueryClient();
  const [customForm, setCustomForm] = useState<CustomFormState | null>(null);
  const ledgerQuery = useQuery({
    queryKey: ["tracking-payment-ledger", slug, memberId, ledgerRequest],
    queryFn: () => fetchPaymentLedger(session, slug, ledgerRequest),
    placeholderData: (previousData) => previousData
  });
  const selectedMemberId = controls.memberId ?? ledgerQuery.data?.selectedMemberId ?? "";
  const selectedMember = ledgerQuery.data?.members.find((member) => member.id === selectedMemberId);
  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createCustomPaymentRecord>[2]) =>
      createCustomPaymentRecord(session, slug, input),
    onSuccess: async () => {
      setCustomForm(null);
      await queryClient.invalidateQueries({ queryKey: ["tracking-payment-ledger", slug] });
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({
      customRecordId,
      input
    }: {
      customRecordId: string;
      input: Parameters<typeof updateCustomPaymentRecord>[3];
    }) => updateCustomPaymentRecord(session, slug, customRecordId, input),
    onSuccess: async () => {
      setCustomForm(null);
      await queryClient.invalidateQueries({ queryKey: ["tracking-payment-ledger", slug] });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (customRecordId: string) =>
      deleteCustomPaymentRecord(session, slug, customRecordId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tracking-payment-ledger", slug] });
    }
  });
  const formPending = createMutation.isPending || updateMutation.isPending;
  const records = ledgerQuery.data?.records ?? [];

  const updateControls = useCallback(
    (change: Partial<LedgerControls>) => {
      setSearchParams(updateLedgerParams(new URLSearchParams(searchParamsValue), change), {
        replace: true
      });
    },
    [searchParamsValue, setSearchParams]
  );

  function openCreateForm() {
    createMutation.reset();
    updateMutation.reset();
    setCustomForm({ mode: "create" });
  }

  function openEditForm(record: PaymentLedgerRecord) {
    createMutation.reset();
    updateMutation.reset();
    setCustomForm({ mode: "edit", record });
  }

  function closeCustomForm() {
    if (!formPending) {
      setCustomForm(null);
    }
  }

  return (
    <WorkspaceShell
      session={session}
      workspaceSession={workspaceSession}
      view="payment-ledger"
      onRecoverPassword={onRecoverPassword}
      onSignOut={onSignOut}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <ReceiptText aria-hidden="true" />
            <h3>User Ledger</h3>
          </div>
          <div className="panel-actions">
            <button
              className="icon-button"
              type="button"
              title="Refresh user ledger"
              aria-label="Refresh user ledger"
              disabled={ledgerQuery.isFetching}
              onClick={() => void ledgerQuery.refetch()}
            >
              <RefreshCw
                className={ledgerQuery.isFetching ? "spin-icon" : undefined}
                aria-hidden="true"
              />
            </button>
            <button
              className="primary-action small"
              type="button"
              disabled={!selectedMemberId}
              onClick={openCreateForm}
            >
              <Plus aria-hidden="true" />
              Add custom record
            </button>
          </div>
        </div>

        {ledgerQuery.data ? (
          <PaymentLedgerControls
            controls={{
              ...controls,
              memberId: selectedMemberId || controls.memberId
            }}
            members={ledgerQuery.data.members}
            disabled={ledgerQuery.isFetching}
            onChange={updateControls}
          />
        ) : null}

        {selectedMember ? (
          <div className="selected-job-summary payment-ledger-summary">
            <strong>{selectedMember.name}</strong>
            <span>Net total: {formatSignedCurrency(netTotal(records))}</span>
          </div>
        ) : null}

        {ledgerQuery.isError && !ledgerQuery.data ? (
          <p className="form-error">{errorMessage(ledgerQuery.error)}</p>
        ) : ledgerQuery.isLoading ? (
          <RecordLoading label="Loading user payment records" />
        ) : ledgerQuery.data ? (
          <>
            <div className="table-wrap">
              <table className="tracking-table payment-ledger-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Amount</th>
                    <th>Income or outcome</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerQuery.isFetching ? (
                    <TableLoadingRow colSpan={5} label="Loading ledger results" />
                  ) : records.length ? (
                    records.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <strong>{record.jobName}</strong>
                          {record.company ? <span>{record.company}</span> : null}
                          <span className="record-muted">{record.sourceDetail}</span>
                        </td>
                        <td>
                          <strong className={`payment-ledger-amount ${record.direction}`}>
                            {formatLedgerAmount(record)}
                          </strong>
                        </td>
                        <td>
                          <span className={`ledger-direction ${record.direction}`}>
                            {record.direction === "income" ? "Income (+)" : "Outcome (-)"}
                          </span>
                        </td>
                        <td>{displayDate(record.date)}</td>
                        <td>
                          {record.source === "custom" && record.customRecordId ? (
                            <div className="record-actions">
                              <button
                                className="secondary-action compact-action"
                                type="button"
                                disabled={deleteMutation.isPending}
                                onClick={() => openEditForm(record)}
                              >
                                <Pencil aria-hidden="true" />
                                Edit
                              </button>
                              <button
                                className="secondary-action danger-action compact-action"
                                type="button"
                                disabled={deleteMutation.isPending}
                                onClick={() => {
                                  const confirmed = window.confirm(
                                    `Delete custom payment record "${record.jobName}"?`
                                  );
                                  if (confirmed && record.customRecordId) {
                                    deleteMutation.mutate(record.customRecordId);
                                  }
                                }}
                              >
                                <Trash2 aria-hidden="true" />
                                Delete
                              </button>
                            </div>
                          ) : (
                            <span className="record-muted">Job payment</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="tracking-table-empty-row">
                      <td colSpan={5}>No payment records match this user and time range.</td>
                    </tr>
                  )}
                </tbody>
                {!ledgerQuery.isFetching && records.length ? (
                  <tfoot>
                    <tr className="payment-ledger-sum-row">
                      <td>
                        <strong>Sum</strong>
                      </td>
                      <td>
                        <strong className={`payment-ledger-amount ${netTotalClass(records)}`}>
                          {formatSignedCurrency(netTotal(records))}
                        </strong>
                      </td>
                      <td colSpan={3}>
                        <span>Income minus outcome</span>
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
            {ledgerQuery.isError ? (
              <p className="form-error">{errorMessage(ledgerQuery.error)}</p>
            ) : null}
            {deleteMutation.error ? (
              <p className="form-error">{errorMessage(deleteMutation.error)}</p>
            ) : null}
          </>
        ) : null}
      </section>

      {customForm && selectedMemberId ? (
        <CustomPaymentRecordForm
          key={customForm.mode === "edit" ? customForm.record.id : "new-custom-payment-record"}
          memberId={selectedMemberId}
          initialRecord={customForm.mode === "edit" ? customForm.record : undefined}
          pending={formPending}
          error={createMutation.error ?? updateMutation.error}
          onClose={closeCustomForm}
          onSubmit={(input) => {
            if (customForm.mode === "edit") {
              const customRecordId = customForm.record.customRecordId;
              if (customRecordId) {
                updateMutation.mutate({ customRecordId, input });
              }
              return;
            }
            createMutation.mutate(input);
          }}
        />
      ) : null}
    </WorkspaceShell>
  );
}

function PaymentLedgerControls({
  controls,
  members,
  disabled,
  onChange
}: {
  controls: LedgerControls;
  members: TrackingMemberSummary[];
  disabled: boolean;
  onChange: (change: Partial<LedgerControls>) => void;
}) {
  return (
    <div className="tracking-list-controls payment-ledger-controls">
      <label>
        User
        <select
          value={controls.memberId ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ memberId: event.target.value || undefined })}
        >
          {members.map((member) => (
            <option value={member.id} key={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Time range
        <select
          value={controls.range}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              range: event.target.value as LedgerRangePreset
            })
          }
        >
          <option value="thisMonth">This month</option>
          <option value="lastMonth">Last month</option>
          <option value="thisYear">This year</option>
          <option value="custom">Custom range</option>
        </select>
      </label>
      {controls.range === "custom" ? (
        <>
          <label>
            From
            <input
              type="date"
              value={controls.customDateFrom}
              disabled={disabled}
              onChange={(event) => onChange({ customDateFrom: event.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={controls.customDateTo}
              disabled={disabled}
              onChange={(event) => onChange({ customDateTo: event.target.value })}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}

function CustomPaymentRecordForm({
  memberId,
  initialRecord,
  pending,
  error,
  onClose,
  onSubmit
}: {
  memberId: string;
  initialRecord?: PaymentLedgerRecord;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof createCustomPaymentRecord>[2]) => void;
}) {
  const [direction, setDirection] = useState<PaymentLedgerDirection>(
    initialRecord?.direction ?? "income"
  );
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <Modal
      title={initialRecord ? "Edit Custom Record" : "Add Custom Record"}
      size="wide"
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const name = fieldValue(form, "name");
          const amount = Number(fieldValue(form, "amount"));
          if (name.length < 2) {
            setFormError("Enter a custom record name.");
            return;
          }
          if (!Number.isFinite(amount) || amount <= 0) {
            setFormError("Enter an amount greater than zero.");
            return;
          }
          setFormError(null);
          onSubmit({
            memberId,
            name,
            amount,
            direction
          });
        }}
      >
        <label>
          Custom record name
          <input
            name="name"
            type="text"
            maxLength={180}
            required
            defaultValue={initialRecord?.jobName ?? ""}
            disabled={pending}
          />
        </label>
        <div className="form-grid">
          <label>
            Amount (US$)
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={initialRecord?.amount ?? ""}
              disabled={pending}
            />
          </label>
          <label>
            Income or outcome
            <select
              value={direction}
              required
              disabled={pending}
              onChange={(event) => setDirection(event.target.value as PaymentLedgerDirection)}
            >
              <option value="income">Income (+)</option>
              <option value="outcome">Outcome (-)</option>
            </select>
          </label>
        </div>
        {formError ? <p className="form-error">{formError}</p> : null}
        {error ? <p className="form-error">{errorMessage(error)}</p> : null}
        <div className="modal-actions">
          <button className="secondary-action" type="button" disabled={pending} onClick={onClose}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button className="primary-action small" type="submit" disabled={pending}>
            <Save aria-hidden="true" />
            {pending ? "Saving" : initialRecord ? "Save changes" : "Save record"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ledgerControlsFromParams(params: URLSearchParams): LedgerControls {
  const range = params.get("range");
  return {
    memberId: optionalValue(params.get("memberId")),
    range: isLedgerRange(range) ? range : "thisMonth",
    customDateFrom: dateInputOrDefault(params.get("dateFrom"), currentMonthStartInput()),
    customDateTo: dateInputOrDefault(params.get("dateTo"), todayInput())
  };
}

function updateLedgerParams(
  params: URLSearchParams,
  change: Partial<LedgerControls>
): URLSearchParams {
  const next = new URLSearchParams(params);
  const current = ledgerControlsFromParams(params);
  const query = { ...current, ...change };

  setOptional(next, "memberId", query.memberId);
  if (query.range === "thisMonth") {
    next.delete("range");
  } else {
    next.set("range", query.range);
  }
  if (query.range === "custom") {
    next.set("dateFrom", query.customDateFrom);
    next.set("dateTo", query.customDateTo);
  } else {
    next.delete("dateFrom");
    next.delete("dateTo");
  }

  return next;
}

function paymentLedgerRequest(controls: LedgerControls): PaymentLedgerQuery {
  return {
    memberId: controls.memberId,
    ...ledgerRange(controls)
  };
}

function ledgerRange(controls: LedgerControls): Pick<PaymentLedgerQuery, "dateFrom" | "dateTo"> {
  if (controls.range === "custom") {
    return {
      dateFrom: dateStartIso(controls.customDateFrom),
      dateTo: dateEndIso(controls.customDateTo)
    };
  }

  const now = new Date();
  if (controls.range === "lastMonth") {
    return localMonthRange(now.getFullYear(), now.getMonth() - 1);
  }
  if (controls.range === "thisYear") {
    return {
      dateFrom: localBoundaryIso(new Date(now.getFullYear(), 0, 1)),
      dateTo: localBoundaryIso(new Date(now.getFullYear() + 1, 0, 1))
    };
  }
  return localMonthRange(now.getFullYear(), now.getMonth());
}

function localMonthRange(
  year: number,
  month: number
): Pick<PaymentLedgerQuery, "dateFrom" | "dateTo"> {
  return {
    dateFrom: localBoundaryIso(new Date(year, month, 1)),
    dateTo: localBoundaryIso(new Date(year, month + 1, 1))
  };
}

function localBoundaryIso(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
}

function dateInputOrDefault(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function dateInputValue(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function dateStartIso(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}

function dateEndIso(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function currentMonthStartInput(): string {
  const now = new Date();
  return dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
}

function todayInput(): string {
  return dateInputValue(new Date().toISOString());
}

function optionalValue(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function setOptional(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    params.delete(key);
    return;
  }
  params.set(key, String(value));
}

function isLedgerRange(value: string | null): value is LedgerRangePreset {
  return (
    value === "thisMonth" || value === "lastMonth" || value === "thisYear" || value === "custom"
  );
}

function formatLedgerAmount(record: PaymentLedgerRecord): string {
  const sign = record.direction === "income" ? "+" : "-";
  return `${sign}${formatCurrency(record.amount)}`;
}

function formatSignedCurrency(value: number): string {
  const sign = value < 0 ? "-" : "+";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function netTotal(records: PaymentLedgerRecord[]): number {
  return records.reduce(
    (total, record) => total + (record.direction === "income" ? record.amount : -record.amount),
    0
  );
}

function netTotalClass(records: PaymentLedgerRecord[]): PaymentLedgerDirection {
  return netTotal(records) < 0 ? "outcome" : "income";
}

function RecordLoading({ label }: { label: string }) {
  return (
    <div className="admin-empty-state">
      <LoaderCircle className="spin-icon" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function TableLoadingRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr className="tracking-table-loading-row">
      <td colSpan={colSpan}>
        <LoaderCircle className="spin-icon" aria-hidden="true" />
        <span>{label}</span>
      </td>
    </tr>
  );
}
