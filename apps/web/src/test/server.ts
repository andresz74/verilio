import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const server = setupServer(
  http.get("/health/ready", () =>
    HttpResponse.json({ status: "ready", database: "connected" }),
  ),
  http.get("/api/v1/timer/current", () =>
    HttpResponse.json({ timer: null, serverNow: "2026-09-05T14:00:00.000Z" }),
  ),
);
