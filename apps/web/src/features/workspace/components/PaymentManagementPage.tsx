import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, DollarSign, LoaderCircle, Plus, RefreshCw, Save, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Modal } from "../../../components/shared/Modal";
import { errorMessage } from "../../../errors";
import type { AuthSession } from "../../../services/auth.service";
import {
  createPaymentRecord,
  fetchPayment,
  fetchPaymentAnalysis,
  fetchPayments,
  payPendingPayments,
  updatePaymentRecord,
  type JobRecord,
  type PaymentAnalysisQuery,
  type PaymentListQuery,
  type PaymentRecord
} from "../../../services/tracking.service";
import type { WorkspaceSession } from "../../../services/workspace.service";
import { displayDate } from "../../../utils/datetime";
import { fieldValue } from "../../../utils/form";
import {
  clearTrackingModalParams,
  paymentListQueryFromParams,
  updatePaymentListParams
} from "../tracking-list-url";
import { PaginationControls } from "./PaginationControls";
import { WorkspaceShell } from "./WorkspaceShell";

type PaymentJobOption = Pick<JobRecord, "id" | "jobTitle" | "company">;
type PaymentAnalysisStatus = NonNullable<PaymentAnalysisQuery["status"]>;
type PaidRangePreset = "thisMonth" | "lastMonth" | "thisYear" | "custom";

export function PaymentManagementPage({
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
  const listQuery = useMemo(
    () => paymentListQueryFromParams(new URLSearchParams(searchParamsValue)),
    [searchParamsValue]
  );
  const creating = searchParams.get("modal") === "new";
  const requestedPaymentId = searchParams.get("paymentRecordId");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<PaymentAnalysisStatus>("pending");
  const [paidRangePreset, setPaidRangePreset] = useState<PaidRangePreset>("thisMonth");
  const [customPaidDateFrom, setCustomPaidDateFrom] = useState(() => currentMonthStartInput());
  const [customPaidDateTo, setCustomPaidDateTo] = useState(() => todayInput());
  const [selectedAnalysisPaymentIds, setSelectedAnalysisPaymentIds] = useState<string[]>([]);
  const analysisRequest = useMemo(
    () =>
      paymentAnalysisRequest(analysisStatus, paidRangePreset, customPaidDateFrom, customPaidDateTo),
    [analysisStatus, customPaidDateFrom, customPaidDateTo, paidRangePreset]
  );
  const queryClient = useQueryClient();
  const paymentsQuery = useQuery({
    queryKey: ["tracking-payments", slug, memberId, listQuery],
    queryFn: () => fetchPayments(session, slug, listQuery),
    placeholderData: (previousData) => previousData
  });
  const requestedPaymentQuery = useQuery({
    queryKey: ["tracking-payment", slug, memberId, requestedPaymentId],
    queryFn: () => fetchPayment(session, slug, requestedPaymentId as string),
    enabled: Boolean(requestedPaymentId)
  });
  const analysisQuery = useQuery({
    queryKey: ["tracking-payment-analysis", slug, memberId, analysisRequest],
    queryFn: () => fetchPaymentAnalysis(session, slug, analysisRequest),
    enabled: analysisOpen
  });
  const analysisPaymentIds = useMemo(
    () => new Set((analysisQuery.data?.payments ?? []).map((payment) => payment.id)),
    [analysisQuery.data?.payments]
  );
  const modalPayment =
    paymentsQuery.data?.payments.find((payment) => payment.id === requestedPaymentId) ??
    requestedPaymentQuery.data?.payment ??
    null;
  const editingPayment = modalPayment && modalPayment.canEdit ? modalPayment : null;
  const selectedPayment = modalPayment && !editingPayment ? modalPayment : null;
  const showPaymentForm = Boolean(
    paymentsQuery.data &&
    (selectedPayment || editingPayment || (creating && paymentsQuery.data.canCreate))
  );
  const updateListQuery = useCallback(
    (change: Partial<PaymentListQuery>) => {
      setSearchParams(updatePaymentListParams(new URLSearchParams(searchParamsValue), change), {
        replace: true
      });
    },
    [searchParamsValue, setSearchParams]
  );
  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createPaymentRecord>[2]) =>
      createPaymentRecord(session, slug, input),
    onSuccess: async () => {
      setSearchParams(clearTrackingModalParams(new URLSearchParams(searchParamsValue)), {
        replace: true
      });
      await refreshPaymentData(queryClient, slug);
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({
      paymentId,
      input
    }: {
      paymentId: string;
      input: Parameters<typeof updatePaymentRecord>[3];
    }) => updatePaymentRecord(session, slug, paymentId, input),
    onSuccess: async () => {
      setSearchParams(clearTrackingModalParams(new URLSearchParams(searchParamsValue)), {
        replace: true
      });
      await refreshPaymentData(queryClient, slug);
    }
  });
  const payMutation = useMutation({
    mutationFn: (paymentRecordIds: string[]) => payPendingPayments(session, slug, paymentRecordIds),
    onSuccess: async () => {
      setSelectedAnalysisPaymentIds([]);
      await refreshPaymentData(queryClient, slug);
    }
  });
  const pending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    setSelectedAnalysisPaymentIds((current) =>
      current.filter((paymentId) => analysisPaymentIds.has(paymentId))
    );
  }, [analysisPaymentIds]);

  function openPayment(payment: PaymentRecord) {
    const next = clearTrackingModalParams(new URLSearchParams(searchParamsValue));
    next.set("paymentRecordId", payment.id);
    setSearchParams(next);
    createMutation.reset();
    updateMutation.reset();
  }

  function closePaymentForm() {
    if (!pending) {
      setSearchParams(clearTrackingModalParams(new URLSearchParams(searchParamsValue)), {
        replace: true
      });
    }
  }

  const formJobRecords = useMemo(() => {
    const records = paymentsQuery.data?.jobRecords ?? [];
    if (!modalPayment || records.some((job) => job.id === modalPayment.jobRecordId)) {
      return records;
    }
    return [
      ...records,
      {
        id: modalPayment.jobRecordId,
        jobTitle: modalPayment.jobTitle,
        company: modalPayment.company
      } satisfies PaymentJobOption
    ];
  }, [modalPayment, paymentsQuery.data?.jobRecords]);

  return (
    <WorkspaceShell
      session={session}
      workspaceSession={workspaceSession}
      view="payments"
      onRecoverPassword={onRecoverPassword}
      onSignOut={onSignOut}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <CreditCard aria-hidden="true" />
            <h3>Payment Management</h3>
          </div>
          <div className="panel-actions">
            <button
              className="secondary-action small"
              type="button"
              onClick={() => {
                setAnalysisStatus("pending");
                setAnalysisOpen(true);
              }}
            >
              <DollarSign aria-hidden="true" />
              Payment analysis
            </button>
            <button
              className="icon-button"
              type="button"
              title="Refresh payments"
              aria-label="Refresh payments"
              disabled={paymentsQuery.isFetching}
              onClick={() => void paymentsQuery.refetch()}
            >
              <RefreshCw
                className={paymentsQuery.isFetching ? "spin-icon" : undefined}
                aria-hidden="true"
              />
            </button>
            {paymentsQuery.data?.canCreate ? (
              <button
                className="primary-action small"
                type="button"
                disabled={!paymentsQuery.data.jobRecords.length}
                onClick={() => {
                  createMutation.reset();
                  updateMutation.reset();
                  const next = clearTrackingModalParams(new URLSearchParams(searchParamsValue));
                  next.set("modal", "new");
                  setSearchParams(next);
                }}
              >
                <Plus aria-hidden="true" />
                Add payment
              </button>
            ) : null}
          </div>
        </div>

        {paymentsQuery.data ? (
          <PaymentListControls
            query={listQuery}
            jobs={paymentsQuery.data.jobRecords}
            disabled={paymentsQuery.isFetching}
            onChange={updateListQuery}
          />
        ) : null}

        {paymentsQuery.isError && !paymentsQuery.data ? (
          <p className="form-error">{errorMessage(paymentsQuery.error)}</p>
        ) : paymentsQuery.isLoading ? (
          <RecordLoading label="Loading payments" />
        ) : paymentsQuery.data ? (
          <>
            <div className="table-wrap">
              <table className="tracking-table tracking-record-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>People</th>
                    <th>Created</th>
                    <th>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsQuery.isFetching ? (
                    <TableLoadingRow colSpan={6} label="Loading payment results" />
                  ) : paymentsQuery.data.payments.length ? (
                    paymentsQuery.data.payments.map((payment) => (
                      <tr
                        key={payment.id}
                        className="tracking-row-clickable"
                        tabIndex={0}
                        onClick={() => openPayment(payment)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openPayment(payment);
                          }
                        }}
                      >
                        <td>
                          <strong>{payment.jobTitle}</strong>
                          <span>{payment.company}</span>
                        </td>
                        <td>{formatCurrency(payment.paymentAmount)}</td>
                        <td>
                          <span
                            className={`status-pill ${
                              payment.status === "paid"
                                ? "member-status-active"
                                : "member-status-pending"
                            }`}
                          >
                            {payment.status}
                          </span>
                        </td>
                        <td>
                          <span>
                            Bidder: {payment.bidder?.name ?? "Former member"} (
                            {formatCurrency(payment.amounts.bidder)})
                          </span>
                          <span>
                            Caller: {payment.caller?.name ?? "Former member"} (
                            {formatCurrency(payment.amounts.caller)})
                          </span>
                          <span>
                            Worker: {payment.worker?.name ?? "Former member"} (
                            {formatCurrency(payment.amounts.worker)})
                          </span>
                          <span>
                            Payment manager: {payment.paymentManager?.name ?? "Former member"} (
                            {formatCurrency(payment.amounts.paymentManager)})
                          </span>
                        </td>
                        <td>
                          <strong>{displayDate(payment.createdAt)}</strong>
                          <span>By {payment.createdBy?.name ?? "Former member"}</span>
                        </td>
                        <td>
                          {payment.paidAt ? (
                            <>
                              <strong>{displayDate(payment.paidAt)}</strong>
                              <span>By {payment.paidBy?.name ?? "Former member"}</span>
                            </>
                          ) : (
                            <span className="record-muted">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="tracking-table-empty-row">
                      <td colSpan={6}>No payments match the current view.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              pagination={paymentsQuery.data.pagination}
              disabled={paymentsQuery.isFetching}
              onPageChange={(page) => updateListQuery({ page })}
              onPageSizeChange={(pageSize) => updateListQuery({ pageSize, page: 1 })}
            />
            {paymentsQuery.isError ? (
              <p className="form-error">{errorMessage(paymentsQuery.error)}</p>
            ) : null}
          </>
        ) : null}
        {requestedPaymentQuery.isError ? (
          <p className="form-error">{errorMessage(requestedPaymentQuery.error)}</p>
        ) : null}
      </section>

      {showPaymentForm && paymentsQuery.data ? (
        <PaymentForm
          key={modalPayment?.id ?? "new-payment"}
          jobRecords={formJobRecords}
          initialPayment={editingPayment ?? selectedPayment ?? undefined}
          readOnly={Boolean(selectedPayment)}
          pending={pending}
          error={createMutation.error ?? updateMutation.error}
          onClose={closePaymentForm}
          onSubmit={(input) => {
            if (editingPayment) {
              updateMutation.mutate({ paymentId: editingPayment.id, input });
            } else {
              createMutation.mutate(input);
            }
          }}
        />
      ) : null}

      {analysisOpen ? (
        <PaymentAnalysisModal
          loading={analysisQuery.isLoading}
          fetching={analysisQuery.isFetching}
          error={analysisQuery.error ?? payMutation.error}
          analysis={analysisQuery.data}
          status={analysisStatus}
          paidRangePreset={paidRangePreset}
          customDateFrom={customPaidDateFrom}
          customDateTo={customPaidDateTo}
          currentMemberId={memberId}
          selectedPaymentIds={selectedAnalysisPaymentIds}
          paying={payMutation.isPending}
          onClose={() => {
            setAnalysisOpen(false);
            setSelectedAnalysisPaymentIds([]);
          }}
          onStatusChange={(status) => {
            setAnalysisStatus(status);
            setSelectedAnalysisPaymentIds([]);
            payMutation.reset();
          }}
          onPaidRangePresetChange={setPaidRangePreset}
          onCustomDateFromChange={setCustomPaidDateFrom}
          onCustomDateToChange={setCustomPaidDateTo}
          onSelectedPaymentIdsChange={setSelectedAnalysisPaymentIds}
          onPay={() => {
            const count = selectedAnalysisPaymentIds.length;
            if (!count) {
              return;
            }
            const confirmed = window.confirm(
              `Mark ${count} selected pending payment record${count === 1 ? "" : "s"} as paid?`
            );
            if (confirmed) {
              payMutation.mutate(selectedAnalysisPaymentIds);
            }
          }}
        />
      ) : null}
    </WorkspaceShell>
  );
}

function PaymentListControls({
  query,
  jobs,
  disabled,
  onChange
}: {
  query: PaymentListQuery;
  jobs: PaymentJobOption[];
  disabled: boolean;
  onChange: (change: Partial<PaymentListQuery>) => void;
}) {
  return (
    <div className="tracking-list-controls">
      <label>
        Job
        <select
          value={query.jobRecordId ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ jobRecordId: event.target.value || undefined, page: 1 })}
        >
          <option value="">All jobs</option>
          {jobs.map((job) => (
            <option value={job.id} key={job.id}>
              {job.jobTitle} at {job.company}
            </option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select
          value={query.status ?? ""}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              status: (event.target.value || undefined) as PaymentListQuery["status"],
              page: 1
            })
          }
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
        </select>
      </label>
      <label>
        Sort
        <select
          value={query.sortBy ?? "datetime"}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              sortBy: event.target.value as PaymentListQuery["sortBy"],
              page: 1
            })
          }
        >
          <option value="datetime">Created date</option>
          <option value="amount">Amount</option>
        </select>
      </label>
      <label>
        Direction
        <select
          value={query.sortDirection ?? "desc"}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              sortDirection: event.target.value as PaymentListQuery["sortDirection"],
              page: 1
            })
          }
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </label>
    </div>
  );
}

function PaymentForm({
  jobRecords,
  initialPayment,
  readOnly,
  pending,
  error,
  onClose,
  onSubmit
}: {
  jobRecords: PaymentJobOption[];
  initialPayment?: PaymentRecord;
  readOnly: boolean;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof createPaymentRecord>[2]) => void;
}) {
  const [jobRecordId, setJobRecordId] = useState(
    initialPayment?.jobRecordId ?? jobRecords[0]?.id ?? ""
  );
  const [formError, setFormError] = useState<string | null>(null);
  const formDisabled = pending || readOnly;

  return (
    <Modal
      title={
        readOnly ? "Payment Details" : initialPayment ? "Edit Payment Record" : "Add Payment Record"
      }
      size="large"
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          if (readOnly) {
            return;
          }
          const paymentAmount = Number(
            fieldValue(new FormData(event.currentTarget), "paymentAmount")
          );
          if (!jobRecordId) {
            setFormError("Select a job record.");
            return;
          }
          if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
            setFormError("Enter a payment amount greater than zero.");
            return;
          }
          setFormError(null);
          onSubmit({ jobRecordId, paymentAmount });
        }}
      >
        <label>
          Payment source
          <select
            required
            value={jobRecordId}
            disabled={formDisabled}
            onChange={(event) => {
              setJobRecordId(event.target.value);
              setFormError(null);
            }}
          >
            <option value="">Select job record</option>
            {jobRecords.map((job) => (
              <option value={job.id} key={job.id}>
                {job.jobTitle} at {job.company}
              </option>
            ))}
          </select>
        </label>
        <label>
          Payment amount (US$)
          <input
            name="paymentAmount"
            type="number"
            min="0.01"
            step="0.01"
            required
            defaultValue={initialPayment?.paymentAmount ?? ""}
            disabled={formDisabled}
          />
        </label>
        {initialPayment ? (
          <div className="selected-job-summary">
            <span>Status: {initialPayment.status}</span>
            <span>Bidder amount: {formatCurrency(initialPayment.amounts.bidder)}</span>
            <span>Caller amount: {formatCurrency(initialPayment.amounts.caller)}</span>
            <span>Worker amount: {formatCurrency(initialPayment.amounts.worker)}</span>
            <span>
              Payment manager amount: {formatCurrency(initialPayment.amounts.paymentManager)}
            </span>
            <span>Created: {displayDate(initialPayment.createdAt)}</span>
            {initialPayment.paidAt ? <span>Paid: {displayDate(initialPayment.paidAt)}</span> : null}
          </div>
        ) : null}
        {formError ? <p className="form-error">{formError}</p> : null}
        {error ? <p className="form-error">{errorMessage(error)}</p> : null}
        <div className="modal-actions">
          <button className="secondary-action" type="button" disabled={pending} onClick={onClose}>
            <X aria-hidden="true" />
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly ? (
            <button className="primary-action small" type="submit" disabled={pending}>
              <Save aria-hidden="true" />
              {pending ? "Saving" : initialPayment ? "Save changes" : "Save payment"}
            </button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

function PaymentAnalysisModal({
  loading,
  fetching,
  error,
  analysis,
  status,
  paidRangePreset,
  customDateFrom,
  customDateTo,
  currentMemberId,
  selectedPaymentIds,
  paying,
  onClose,
  onStatusChange,
  onPaidRangePresetChange,
  onCustomDateFromChange,
  onCustomDateToChange,
  onSelectedPaymentIdsChange,
  onPay
}: {
  loading: boolean;
  fetching: boolean;
  error: Error | null;
  analysis?: Awaited<ReturnType<typeof fetchPaymentAnalysis>>;
  status: PaymentAnalysisStatus;
  paidRangePreset: PaidRangePreset;
  customDateFrom: string;
  customDateTo: string;
  currentMemberId: string;
  selectedPaymentIds: string[];
  paying: boolean;
  onClose: () => void;
  onStatusChange: (status: PaymentAnalysisStatus) => void;
  onPaidRangePresetChange: (range: PaidRangePreset) => void;
  onCustomDateFromChange: (value: string) => void;
  onCustomDateToChange: (value: string) => void;
  onSelectedPaymentIdsChange: (paymentIds: string[]) => void;
  onPay: () => void;
}) {
  const payments = analysis?.payments ?? [];
  const modeLabel = status === "pending" ? "pending" : "paid";
  const amountLabel = status === "pending" ? "incoming amount" : "paid amount";
  const canSelectPayments = Boolean(analysis?.canPay && status === "pending");
  const selectedPaymentIdSet = new Set(selectedPaymentIds);
  const selectedPayments = canSelectPayments
    ? payments.filter((payment) => selectedPaymentIdSet.has(payment.id))
    : [];
  const displayTotals = canSelectPayments
    ? paymentAnalysisTotalsForSelection(selectedPayments, currentMemberId)
    : {
        currentUserTotal: analysis?.currentUserTotal ?? 0,
        userTotals: analysis?.userTotals ?? []
      };
  const allPaymentsSelected =
    canSelectPayments &&
    payments.length > 0 &&
    payments.every((payment) => selectedPaymentIdSet.has(payment.id));

  function setPaymentSelected(paymentId: string, selected: boolean) {
    const next = new Set(selectedPaymentIds);
    if (selected) {
      next.add(paymentId);
    } else {
      next.delete(paymentId);
    }
    onSelectedPaymentIdsChange([...next]);
  }

  function setAllPaymentsSelected(selected: boolean) {
    onSelectedPaymentIdsChange(selected ? payments.map((payment) => payment.id) : []);
  }

  return (
    <Modal title="Payment Analysis" size="large" onClose={onClose}>
      <div className="modal-form">
        <div className="tracking-list-controls">
          <label>
            Status
            <select
              value={status}
              disabled={fetching}
              onChange={(event) => onStatusChange(event.target.value as PaymentAnalysisStatus)}
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          {status === "paid" ? (
            <>
              <label>
                Time range
                <select
                  value={paidRangePreset}
                  disabled={fetching}
                  onChange={(event) =>
                    onPaidRangePresetChange(event.target.value as PaidRangePreset)
                  }
                >
                  <option value="thisMonth">This month</option>
                  <option value="lastMonth">Last month</option>
                  <option value="thisYear">This year</option>
                  <option value="custom">Custom range</option>
                </select>
              </label>
              {paidRangePreset === "custom" ? (
                <>
                  <label>
                    From
                    <input
                      type="date"
                      value={customDateFrom}
                      disabled={fetching}
                      onChange={(event) => onCustomDateFromChange(event.target.value)}
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      value={customDateTo}
                      disabled={fetching}
                      onChange={(event) => onCustomDateToChange(event.target.value)}
                    />
                  </label>
                </>
              ) : null}
            </>
          ) : null}
        </div>

        {loading ? (
          <RecordLoading label={`Loading ${modeLabel} payments`} />
        ) : analysis ? (
          <>
            <div className="selected-job-summary">
              <strong>
                Your {amountLabel}: {formatCurrency(displayTotals.currentUserTotal)}
              </strong>
              {fetching ? <span className="record-muted">Refreshing analysis</span> : null}
              {displayTotals.userTotals.length ? (
                <div className="profile-tags">
                  {displayTotals.userTotals.map((total) => (
                    <span key={total.member.id}>
                      {total.member.name}: {formatCurrency(total.pendingAmount)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="table-wrap">
              <table className="tracking-table tracking-record-table">
                <thead>
                  <tr>
                    {canSelectPayments ? (
                      <th className="tracking-table-select-cell">
                        <input
                          type="checkbox"
                          aria-label="Select all pending payments"
                          checked={allPaymentsSelected}
                          disabled={fetching || paying || !payments.length}
                          onChange={(event) => setAllPaymentsSelected(event.target.checked)}
                        />
                      </th>
                    ) : null}
                    <th>Job</th>
                    <th>Amount</th>
                    <th>Participants</th>
                    <th>{status === "paid" ? "Paid" : "Created"}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length ? (
                    payments.map((payment) => (
                      <tr key={payment.id}>
                        {canSelectPayments ? (
                          <td className="tracking-table-select-cell">
                            <input
                              type="checkbox"
                              aria-label={`Select payment for ${payment.jobTitle} at ${payment.company}`}
                              checked={selectedPaymentIdSet.has(payment.id)}
                              disabled={fetching || paying}
                              onChange={(event) =>
                                setPaymentSelected(payment.id, event.target.checked)
                              }
                            />
                          </td>
                        ) : null}
                        <td>
                          <strong>{payment.jobTitle}</strong>
                          <span>{payment.company}</span>
                        </td>
                        <td>{formatCurrency(payment.paymentAmount)}</td>
                        <td>
                          <span>
                            Bidder: {payment.bidder?.name ?? "Former member"}{" "}
                            {formatCurrency(payment.amounts.bidder)}
                          </span>
                          <span>
                            Caller: {payment.caller?.name ?? "Former member"}{" "}
                            {formatCurrency(payment.amounts.caller)}
                          </span>
                          <span>
                            Worker: {payment.worker?.name ?? "Former member"}{" "}
                            {formatCurrency(payment.amounts.worker)}
                          </span>
                          <span>
                            Discount: {payment.paymentManager?.name ?? "Former member"}{" "}
                            {formatCurrency(payment.amounts.paymentManager)}
                          </span>
                        </td>
                        <td>
                          {displayDate(
                            status === "paid" && payment.paidAt ? payment.paidAt : payment.createdAt
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="tracking-table-empty-row">
                      <td colSpan={canSelectPayments ? 5 : 4}>
                        No {modeLabel} payments match this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {error ? <p className="form-error">{errorMessage(error)}</p> : null}
            <div className="modal-actions">
              <button
                className="secondary-action"
                type="button"
                disabled={paying}
                onClick={onClose}
              >
                <X aria-hidden="true" />
                Close
              </button>
              {analysis.canPay ? (
                <button
                  className="primary-action small"
                  type="button"
                  disabled={paying || !selectedPaymentIds.length}
                  onClick={onPay}
                >
                  <DollarSign aria-hidden="true" />
                  {paying ? "Paying" : `Pay selected (${selectedPaymentIds.length})`}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {error ? <p className="form-error">{errorMessage(error)}</p> : null}
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={onClose}>
                <X aria-hidden="true" />
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

type PaymentAnalysisMember = NonNullable<PaymentRecord["bidder"]>;
type PaymentAnalysisUserTotal = {
  member: PaymentAnalysisMember;
  pendingAmount: number;
};

function paymentAnalysisTotalsForSelection(
  payments: PaymentRecord[],
  currentMemberId: string
): { currentUserTotal: number; userTotals: PaymentAnalysisUserTotal[] } {
  const totals = new Map<string, PaymentAnalysisUserTotal>();
  for (const payment of payments) {
    addPaymentAnalysisAmount(totals, payment.bidder, payment.amounts.bidder);
    addPaymentAnalysisAmount(totals, payment.caller, payment.amounts.caller);
    addPaymentAnalysisAmount(totals, payment.worker, payment.amounts.worker);
    addPaymentAnalysisAmount(totals, payment.paymentManager, payment.amounts.paymentManager);
  }
  const userTotals = [...totals.values()].sort(
    (left, right) =>
      right.pendingAmount - left.pendingAmount || left.member.name.localeCompare(right.member.name)
  );

  return {
    currentUserTotal: totals.get(currentMemberId)?.pendingAmount ?? 0,
    userTotals
  };
}

function addPaymentAnalysisAmount(
  totals: Map<string, PaymentAnalysisUserTotal>,
  member: PaymentAnalysisMember | null,
  amount: number
) {
  if (!member || amount <= 0) {
    return;
  }
  const current = totals.get(member.id);
  totals.set(member.id, {
    member,
    pendingAmount: roundCurrency((current?.pendingAmount ?? 0) + amount)
  });
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

function paymentAnalysisRequest(
  status: PaymentAnalysisStatus,
  paidRangePreset: PaidRangePreset,
  customDateFrom: string,
  customDateTo: string
): PaymentAnalysisQuery {
  if (status === "pending") {
    return { status };
  }

  return {
    status,
    ...paidAnalysisRange(paidRangePreset, customDateFrom, customDateTo)
  };
}

function paidAnalysisRange(
  preset: PaidRangePreset,
  customDateFrom: string,
  customDateTo: string
): Pick<PaymentAnalysisQuery, "dateFrom" | "dateTo"> {
  if (preset === "custom") {
    return {
      dateFrom: dateStartIso(customDateFrom),
      dateTo: dateEndIso(customDateTo)
    };
  }

  const now = new Date();
  if (preset === "lastMonth") {
    return localMonthRange(now.getFullYear(), now.getMonth() - 1);
  }
  if (preset === "thisYear") {
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
): Pick<PaymentAnalysisQuery, "dateFrom" | "dateTo"> {
  return {
    dateFrom: localBoundaryIso(new Date(year, month, 1)),
    dateTo: localBoundaryIso(new Date(year, month + 1, 1))
  };
}

function localBoundaryIso(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
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

async function refreshPaymentData(queryClient: ReturnType<typeof useQueryClient>, slug: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["tracking-payments", slug] }),
    queryClient.invalidateQueries({ queryKey: ["tracking-payment-analysis", slug] })
  ]);
}
