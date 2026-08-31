import { createBrowserRouter } from "react-router-dom";

import { FoundationPage } from "./foundation-page.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <FoundationPage />,
  },
]);

