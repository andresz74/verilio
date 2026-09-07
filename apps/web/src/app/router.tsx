import { Navigate, createBrowserRouter } from "react-router-dom";

import { AppShell } from "./app-shell.js";
import { ClientsPage } from "../features/clients/clients-page.js";
import { InvoiceEditorPage } from "../features/invoices/invoice-editor-page.js";
import { InvoicesPage } from "../features/invoices/invoices-page.js";
import { ProjectDetailPage } from "../features/projects/project-detail-page.js";
import { ProjectsPage } from "../features/projects/projects-page.js";
import { ReportsIndexRedirect, ReportsPage } from "../features/reports/reports-page.js";
import { SettingsPage } from "../features/settings/settings-page.js";
import { TimerPage } from "../features/timer/timer-page.js";
import { TimesheetPage } from "../features/timesheet/timesheet-page.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate replace to="/timer" /> },
      {
        path: "timer",
        element: <TimerPage />,
      },
      {
        path: "timesheet",
        element: <TimesheetPage />,
      },
      {
        path: "reports",
        children: [
          { index: true, element: <ReportsIndexRedirect /> },
          { path: "summary", element: <ReportsPage view="summary" /> },
          { path: "detailed", element: <ReportsPage view="detailed" /> },
        ],
      },
      {
        path: "clients",
        element: <ClientsPage />,
      },
      {
        path: "projects",
        element: <ProjectsPage />,
      },
      {
        path: "projects/:projectId",
        element: <ProjectDetailPage />,
      },
      {
        path: "invoices",
        element: <InvoicesPage />,
      },
      { path: "invoices/new", element: <InvoiceEditorPage /> },
      { path: "invoices/:invoiceId", element: <InvoiceEditorPage /> },
      {
        path: "settings",
        element: <SettingsPage />,
      },
    ],
  },
]);
