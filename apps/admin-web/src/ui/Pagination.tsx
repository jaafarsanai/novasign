import React from "react";
import "./Pagination.css";

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (n: number) => void;
  pageSizeOptions?: number[];
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  function prev() {
    onPageChange(Math.max(1, page - 1));
  }
  function next() {
    onPageChange(Math.min(totalPages, page + 1));
  }

  return (
    <div className="ns2-pager">
      <div className="ns2-pager-left">
        <span className="ns2-pager-range">
          {start}–{end} of {total}
        </span>

        {onPageSizeChange && (
          <select
            className="ns2-pager-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="ns2-pager-right">
        <button type="button" className="ns2-pager-btn" onClick={prev} disabled={page <= 1}>
          Prev
        </button>
        <span className="ns2-pager-page">
          {page} / {totalPages}
        </span>
        <button type="button" className="ns2-pager-btn" onClick={next} disabled={page >= totalPages}>
          Next
        </button>
      </div>
    </div>
  );
}

