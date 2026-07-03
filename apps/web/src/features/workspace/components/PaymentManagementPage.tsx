import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, LoaderCircle, Plus, RefreshCw, Save, X } from "lucide-react";
import { FormEvent, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Modal } from "../../../components/shared/Modal";
import { errorMessage } from "../../../errors";
import type { AuthSession } from "../../../services/auth.service";
import {
  createPaymentRecord,
  fetchPayment,
  fetchPayments,
  updatePaymentRecord,
  type JobRecord,
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
  const pending = createMutation.isPending || updateMutation.isPending;

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
              <table className="tracking-table payment-management-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Amount</th>
                    <th>People</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsQuery.isFetching ? (
                    <TableLoadingRow colSpan={4} label="Loading payment results" />
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
                      </tr>
                    ))
                  ) : (
                    <tr className="tracking-table-empty-row">
                      <td colSpan={4}>No payments match the current view.</td>
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
    <div className="tracking-list-controls payment-management-controls">
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
            <span>Bidder amount: {formatCurrency(initialPayment.amounts.bidder)}</span>
            <span>Caller amount: {formatCurrency(initialPayment.amounts.caller)}</span>
            <span>Worker amount: {formatCurrency(initialPayment.amounts.worker)}</span>
            <span>
              Payment manager amount: {formatCurrency(initialPayment.amounts.paymentManager)}
            </span>
            <span>Created: {displayDate(initialPayment.createdAt)}</span>
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
    queryClient.invalidateQueries({ queryKey: ["tracking-payment-ledger", slug] })
  ]);
}
