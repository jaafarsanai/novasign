/* apps/admin-web/src/pages/screens/Screens.css */

.screens-page {
  padding: 40px 80px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f4f7fb;
  min-height: 100vh;
  box-sizing: border-box;
}

.screens-title {
  font-size: 28px;
  font-weight: 600;
  color: #182233;
  margin-bottom: 4px;
}

.screens-subtitle {
  font-size: 14px;
  color: #63728a;
  margin-bottom: 24px;
}

.screens-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.screens-actions {
  display: flex;
  gap: 16px;
  font-size: 14px;
}

.screens-link-button {
  border: none;
  background: none;
  padding: 0;
  color: #1f6ff2;
  cursor: pointer;
  font-size: 14px;
}

.screens-link-button:hover {
  text-decoration: underline;
}

/* Card around the table */
.screens-card {
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.12);
  overflow: hidden;
}

/* Table */
.screens-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.screens-table thead {
  background: #fafbff;
}

.screens-table th,
.screens-table td {
  padding: 14px 24px;
  text-align: left;
}

.screens-table th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  color: #9aa3ba;
  border-bottom: 1px solid #ecf0f7;
}

.screens-table tbody tr {
  border-bottom: 1px solid #f1f3fa;
}

.screens-table tbody tr:last-child {
  border-bottom: none;
}

.screens-table tbody tr:hover {
  background: #f8fafc;
}

/* Screen name */
.screens-name {
  font-weight: 500;
  color: #1f2937;
}

/* Type column text */
.screens-type {
  color: #64748b;
}

/* Status pills */
.screens-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.screens-status-pill--pending {
  background: #fef3c7;
  color: #b45309;
}

.screens-status-pill--live {
  background: #dcfce7;
  color: #166534;
}

.screens-status-pill--offline {
  background: #e5e7eb;
  color: #374151;
}

/* Last seen text */
.screens-last-seen {
  color: #6b7280;
}

/* Empty state row */
.screens-empty-row td {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-style: italic;
}

/* Actions (three dots) */
.screens-actions-cell {
  width: 60px;
  text-align: right;
  position: relative;
}

.screens-actions-button {
  border: none;
  background: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 999px;
}

.screens-actions-button:hover {
  background: #f3f4f6;
}

.screens-actions-button-icon {
  font-size: 18px;
  line-height: 1;
  color: #6b7280;
}

/* Dropdown menu for each row */
.screens-row-menu {
  position: absolute;
  right: 24px;
  top: 36px;
  min-width: 160px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.18);
  padding: 6px 0;
  z-index: 10;
}

.screens-row-menu-item {
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.screens-row-menu-item:hover {
  background: #f3f4f6;
}

.screens-row-menu-item--danger {
  color: #dc2626;
}

/* Responsive */
@media (max-width: 960px) {
  .screens-page {
    padding: 24px 16px;
  }

  .screens-card {
    border-radius: 12px;
  }

  .screens-table th,
  .screens-table td {
    padding: 10px 12px;
  }
}

