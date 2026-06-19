import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Pagination } from "../../../services/tracking.service";

export function PaginationControls({
  pagination,
  disabled,
  onPageChange,
  onPageSizeChange
}: {
  pagination: Pagination;
  disabled: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const firstRecord = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const lastRecord = Math.min(pagination.page * pagination.pageSize, pagination.total);

  return (
    <div className="pagination-controls">
      <span>
        {firstRecord}-{lastRecord} of {pagination.total}
      </span>
      <label>
        Rows
        <select
          value={pagination.pageSize}
          disabled={disabled}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {[10, 20, 50, 100].map((size) => (
            <option value={size} key={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button
          className="icon-button"
          type="button"
          title="Previous page"
          aria-label="Previous page"
          disabled={disabled || pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <strong>
          {pagination.page} / {pagination.totalPages}
        </strong>
        <button
          className="icon-button"
          type="button"
          title="Next page"
          aria-label="Next page"
          disabled={disabled || pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
