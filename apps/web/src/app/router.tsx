import { Navigate, createBrowserRouter } from "react-router-dom";

import { AppShell } from "./app-shell.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    HydrateFallback: AppRouteFallback,
    children: [
      { index: true, element: <Navigate replace to="/timer" /> },
      {
        path: "timer",
        lazy: async () => {
          const { TimerPage } = await import("../features/timer/timer-page.js");
          return { Component: TimerPage };
        },
      },
      {
        path: "timesheet",
        lazy: async () => {
          const { TimesheetPage } = await import("../features/timesheet/timesheet-page.js");
          return { Component: TimesheetPage };
        },
      },
      {
        path: "reports",
        children: [
          {
            index: true,
            lazy: async () => {
              const { ReportsIndexRedirect } = await import(
                "../features/reports/reports-page.js"
              );
              return { Component: ReportsIndexRedirect };
            },
          },
          {
            path: "summary",
            lazy: async () => {
              const { ReportsPage } = await import(
                "../features/reports/reports-page.js"
              );
              return { Component: () => <ReportsPage view="summary" /> };
            },
          },
          {
            path: "detailed",
            lazy: async () => {
              const { ReportsPage } = await import(
                "../features/reports/reports-page.js"
              );
              return { Component: () => <ReportsPage view="detailed" /> };
            },
          },
        ],
      },
      {
        path: "clients",
        lazy: async () => {
          const { ClientsPage } = await import(
            "../features/clients/clients-page.js"
          );
          return { Component: ClientsPage };
        },
      },
      {
        path: "projects",
        lazy: async () => {
          const { ProjectsPage } = await import(
            "../features/projects/projects-page.js"
          );
          return { Component: ProjectsPage };
        },
      },
      {
        path: "projects/:projectId",
        lazy: async () => {
          const { ProjectDetailPage } = await import(
            "../features/projects/project-detail-page.js"
          );
          return { Component: ProjectDetailPage };
        },
      },
      {
        path: "invoices",
        lazy: async () => {
          const { InvoicesPage } = await import(
            "../features/invoices/invoices-page.js"
          );
          return { Component: InvoicesPage };
        },
      },
      {
        path: "invoices/new",
        lazy: async () => {
          const { InvoiceEditorPage } = await import(
            "../features/invoices/invoice-editor-page.js"
          );
          return { Component: InvoiceEditorPage };
        },
      },
      {
        path: "invoices/:invoiceId",
        lazy: async () => {
          const { InvoiceEditorPage } = await import(
            "../features/invoices/invoice-editor-page.js"
          );
          return { Component: InvoiceEditorPage };
        },
      },
      {
        path: "settings",
        lazy: async () => {
          const { SettingsPage } = await import(
            "../features/settings/settings-page.js"
          );
          return { Component: SettingsPage };
        },
      },
    ],
  },
]);

function AppRouteFallback() {
  return (
    <div
      aria-label="Loading Verilio"
      className="grid min-h-dvh place-items-center bg-[var(--color-bg-canvas)] text-sm text-[var(--color-text-secondary)]"
      role="status"
    >
      Loading Verilio…
    </div>
  );
}
