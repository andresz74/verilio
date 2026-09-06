import { Navigate, createBrowserRouter } from "react-router-dom";

import { AppShell } from "./app-shell.js";
import { PlaceholderPage } from "./placeholder-page.js";
import { ClientsPage } from "../features/clients/clients-page.js";
import { ProjectDetailPage } from "../features/projects/project-detail-page.js";
import { ProjectsPage } from "../features/projects/projects-page.js";
import { SettingsPage } from "../features/settings/settings-page.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate replace to="/timer" /> },
      {
        path: "timer",
        element: (
          <PlaceholderPage
            title="Timer"
            description="Track the work in front of you without losing billing context."
          />
        ),
      },
      {
        path: "timesheet",
        element: (
          <PlaceholderPage
            title="Timesheet"
            description="Review and correct your tracked work by day."
          />
        ),
      },
      {
        path: "reports",
        element: (
          <PlaceholderPage
            title="Reports"
            description="Understand tracked time, billable value, and invoice state."
          />
        ),
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
        element: (
          <PlaceholderPage
            title="Invoices"
            description="Turn verified work into professional invoices."
          />
        ),
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
    ],
  },
]);
