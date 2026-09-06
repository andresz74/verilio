import type { ClientDto, ClientInput, ClientListQuery } from "@verilio/contracts";
import type { VerilioDatabase } from "@verilio/db";
import { clients, users } from "@verilio/db";
import { and, asc, eq, ilike } from "drizzle-orm";

import { LOCAL_USER_ID } from "./settings-service.js";

type ClientRow = typeof clients.$inferSelect;

export interface ClientServiceContract {
  list(query: ClientListQuery): Promise<ClientDto[]>;
  get(id: string): Promise<ClientDto | null>;
  create(input: ClientInput): Promise<ClientDto>;
  update(id: string, input: ClientInput): Promise<ClientDto | null>;
  setActive(id: string, active: boolean): Promise<ClientDto | null>;
}

export class ClientService implements ClientServiceContract {
  constructor(
    private readonly db: VerilioDatabase,
    private readonly ownerId = LOCAL_USER_ID,
  ) {}

  async list(query: ClientListQuery): Promise<ClientDto[]> {
    const rows = await this.db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.userId, this.ownerId),
          query.status === "all"
            ? undefined
            : eq(clients.active, query.status === "active"),
          query.search ? ilike(clients.name, `%${query.search}%`) : undefined,
        ),
      )
      .orderBy(asc(clients.name), asc(clients.createdAt));

    return rows.map(toDto);
  }

  async get(id: string): Promise<ClientDto | null> {
    const [row] = await this.db
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), eq(clients.userId, this.ownerId)))
      .limit(1);

    return row ? toDto(row) : null;
  }

  async create(input: ClientInput): Promise<ClientDto> {
    return this.db.transaction(async (transaction) => {
      await transaction
        .insert(users)
        .values({ id: this.ownerId, displayName: "Local owner" })
        .onConflictDoNothing();

      const [row] = await transaction
        .insert(clients)
        .values(toPersistenceValues(this.ownerId, input))
        .returning();

      if (!row) throw new Error("Client insert returned no record");
      return toDto(row);
    });
  }

  async update(id: string, input: ClientInput): Promise<ClientDto | null> {
    const [row] = await this.db
      .update(clients)
      .set({
        ...toPersistenceValues(this.ownerId, input),
        updatedAt: new Date(),
      })
      .where(and(eq(clients.id, id), eq(clients.userId, this.ownerId)))
      .returning();

    return row ? toDto(row) : null;
  }

  async setActive(id: string, active: boolean): Promise<ClientDto | null> {
    const [row] = await this.db
      .update(clients)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(clients.id, id), eq(clients.userId, this.ownerId)))
      .returning();

    return row ? toDto(row) : null;
  }
}

function toPersistenceValues(ownerId: string, input: ClientInput) {
  return {
    userId: ownerId,
    name: input.name.trim(),
    email: emptyToNull(input.email),
    ccRecipients: input.ccRecipients.map((email) => email.trim()).filter(Boolean),
    address: emptyToNull(input.address),
    note: emptyToNull(input.note),
    currency: input.currency,
    defaultHourlyRate:
      input.rateMode === "override" ? input.defaultHourlyRate : null,
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDto(row: ClientRow): ClientDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    ccRecipients: row.ccRecipients,
    address: row.address,
    note: row.note,
    currency: row.currency,
    defaultHourlyRate: row.defaultHourlyRate,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
