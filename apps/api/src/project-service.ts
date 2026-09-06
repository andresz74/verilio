import type {
  ProjectDto,
  ProjectInput,
  ProjectListQuery,
} from "@verilio/contracts";
import type { VerilioDatabase } from "@verilio/db";
import { clients, projects } from "@verilio/db";
import { and, asc, eq, ilike } from "drizzle-orm";

import { ApiError } from "./errors.js";
import { LOCAL_USER_ID } from "./settings-service.js";

type ProjectRow = typeof projects.$inferSelect;

export interface ProjectServiceContract {
  list(query: ProjectListQuery): Promise<ProjectDto[]>;
  get(id: string): Promise<ProjectDto | null>;
  create(input: ProjectInput): Promise<ProjectDto>;
  update(id: string, input: ProjectInput): Promise<ProjectDto | null>;
  setActive(id: string, active: boolean): Promise<ProjectDto | null>;
}

export class ProjectService implements ProjectServiceContract {
  constructor(
    private readonly db: VerilioDatabase,
    private readonly ownerId = LOCAL_USER_ID,
  ) {}

  async list(query: ProjectListQuery): Promise<ProjectDto[]> {
    const rows = await this.db
      .select({ project: projects })
      .from(projects)
      .innerJoin(
        clients,
        and(eq(projects.clientId, clients.id), eq(projects.userId, clients.userId)),
      )
      .where(
        and(
          eq(projects.userId, this.ownerId),
          query.status === "all"
            ? undefined
            : eq(projects.active, query.status === "active"),
          query.clientId ? eq(projects.clientId, query.clientId) : undefined,
          query.search ? ilike(projects.name, `%${query.search}%`) : undefined,
          query.availability === "new-work" ? eq(clients.active, true) : undefined,
        ),
      )
      .orderBy(asc(projects.name), asc(projects.createdAt));

    return rows.map(({ project }) => toDto(project));
  }

  async get(id: string): Promise<ProjectDto | null> {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, this.ownerId)))
      .limit(1);

    return row ? toDto(row) : null;
  }

  async create(input: ProjectInput): Promise<ProjectDto> {
    await this.requireAvailableClient(input.clientId);
    const [row] = await this.db
      .insert(projects)
      .values(toPersistenceValues(this.ownerId, input))
      .returning();

    if (!row) throw new Error("Project insert returned no record");
    return toDto(row);
  }

  async update(id: string, input: ProjectInput): Promise<ProjectDto | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    await this.requireOwnedClient(
      input.clientId,
      input.clientId !== existing.clientId,
    );

    const [row] = await this.db
      .update(projects)
      .set({
        ...toPersistenceValues(this.ownerId, input),
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, id), eq(projects.userId, this.ownerId)))
      .returning();

    return row ? toDto(row) : null;
  }

  async setActive(id: string, active: boolean): Promise<ProjectDto | null> {
    const [row] = await this.db
      .update(projects)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.userId, this.ownerId)))
      .returning();

    return row ? toDto(row) : null;
  }

  private async requireAvailableClient(clientId: string): Promise<void> {
    return this.requireOwnedClient(clientId, true);
  }

  private async requireOwnedClient(clientId: string, requireActive: boolean): Promise<void> {
    const [client] = await this.db
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          eq(clients.id, clientId),
          eq(clients.userId, this.ownerId),
          requireActive ? eq(clients.active, true) : undefined,
        ),
      )
      .limit(1);

    if (!client) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Choose an active client you can access.",
        { clientId: ["Choose an active client you can access"] },
      );
    }
  }
}

function toPersistenceValues(ownerId: string, input: ProjectInput) {
  return {
    userId: ownerId,
    clientId: input.clientId,
    name: input.name.trim(),
    color: emptyToNull(input.color),
    defaultHourlyRate:
      input.rateMode === "override" ? input.defaultHourlyRate : null,
    billableByDefault: input.billableByDefault,
    note: emptyToNull(input.note),
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDto(row: ProjectRow): ProjectDto {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    color: row.color,
    defaultHourlyRate: row.defaultHourlyRate,
    billableByDefault: row.billableByDefault,
    note: row.note,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
