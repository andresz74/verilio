import type { ProjectDto, ProjectInput } from "@verilio/contracts";
import type { VerilioDatabase } from "@verilio/db";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { ProjectServiceContract } from "../src/project-service.js";

const clientId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const validInput: ProjectInput = {
  clientId,
  name: "Website redesign",
  color: "#4F46E5",
  rateMode: "inherit",
  defaultHourlyRate: null,
  billableByDefault: true,
  note: "Launch project",
};
const savedProject: ProjectDto = {
  id: projectId,
  clientId,
  name: validInput.name,
  color: validInput.color,
  defaultHourlyRate: null,
  billableByDefault: true,
  note: validInput.note,
  active: true,
  createdAt: "2026-09-05T12:00:00.000Z",
  updatedAt: "2026-09-05T12:00:00.000Z",
};

function createProjectService(): ProjectServiceContract {
  return {
    list: vi.fn().mockResolvedValue([savedProject]),
    get: vi.fn().mockResolvedValue(savedProject),
    create: vi.fn().mockResolvedValue(savedProject),
    update: vi.fn().mockResolvedValue(savedProject),
    setActive: vi.fn().mockImplementation((_id: string, active: boolean) =>
      Promise.resolve({ ...savedProject, active }),
    ),
  };
}

describe("project routes", () => {
  it("validates project creation before persistence", async () => {
    const projectService = createProjectService();
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      projectService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      payload: {
        ...validInput,
        clientId: "missing",
        name: "",
        rateMode: "override",
        defaultHourlyRate: "-1",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: {
          clientId: [expect.any(String)],
          name: ["Project name is required"],
          defaultHourlyRate: ["Value must be non-negative"],
        },
      },
    });
    expect(projectService.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("creates, lists, reads, and updates through the service boundary", async () => {
    const projectService = createProjectService();
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      projectService,
    });

    expect(
      (await app.inject({ method: "POST", url: "/api/v1/projects", payload: validInput }))
        .statusCode,
    ).toBe(201);
    expect(projectService.create).toHaveBeenCalledWith(validInput);

    await app.inject({
      method: "GET",
      url: `/api/v1/projects?clientId=${clientId}&status=active&availability=new-work&search=web`,
    });
    expect(projectService.list).toHaveBeenCalledWith({
      clientId,
      status: "active",
      availability: "new-work",
      search: "web",
    });

    expect(
      (await app.inject({ method: "GET", url: `/api/v1/projects/${projectId}` }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/projects/${projectId}`,
          payload: { ...validInput, name: "Website launch" },
        })
      ).statusCode,
    ).toBe(200);
    expect(projectService.update).toHaveBeenCalledWith(projectId, {
      ...validInput,
      name: "Website launch",
    });
    await app.close();
  });

  it("uses archive and reactivate commands", async () => {
    const projectService = createProjectService();
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      projectService,
    });

    await app.inject({ method: "POST", url: `/api/v1/projects/${projectId}/archive` });
    expect(projectService.setActive).toHaveBeenCalledWith(projectId, false);
    await app.inject({ method: "POST", url: `/api/v1/projects/${projectId}/reactivate` });
    expect(projectService.setActive).toHaveBeenCalledWith(projectId, true);
    await app.close();
  });
});
