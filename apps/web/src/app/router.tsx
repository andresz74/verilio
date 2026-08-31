import { Navigate, createBrowserRouter } from "react-router-dom";

import { AppShell } from "./app-shell.js";
import { PlaceholderPage } from "./placeholder-page.js";
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
        element: (
          <PlaceholderPage
            title="Clients"
            description="Manage the people and businesses you work for."
          />
        ),
      },
      {
        path: "projects",
        element: (
          <PlaceholderPage
            title="Projects"
            description="Organize client work into clear billing contexts."
          />
        ),
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
