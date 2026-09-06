import { ClientStatusFilterSchema, type ClientDto } from "@verilio/contracts";
import {
  Button,
  Dialog,
  DialogClose,
  InlineError,
  Select,
  Spinner,
  StatusBadge,
  TextInput,
} from "@verilio/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { PageHeader } from "../../app/app-shell.js";
import { getSettings } from "../settings/settings-api.js";
import {
  archiveClient,
  clientKeys,
  getClients,
  reactivateClient,
} from "./client-api.js";
import { ClientFormDialog } from "./client-form-dialog.js";

type EditorState = { mode: "create" } | { mode: "edit"; client: ClientDto } | null;

export function ClientsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editor, setEditor] = useState<EditorState>(null);
  const [archiveTarget, setArchiveTarget] = useState<ClientDto | null>(null);
  const statusResult = ClientStatusFilterSchema.safeParse(searchParams.get("status") ?? "active");
  const status = statusResult.success ? statusResult.data : "active";
  const search = searchParams.get("search") ?? "";
  const query = { status, search };
  const clientsQuery = useQuery({
    queryKey: clientKeys.list(query),
    queryFn: () => getClients(query),
  });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const statusMutation = useMutation({
    mutationFn: ({ client, active }: { client: ClientDto; active: boolean }) =>
      active ? reactivateClient(client.id) : archiveClient(client.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clientKeys.all });
      setArchiveTarget(null);
    },
  });

  const updateFilter = (key: "search" | "status", value: string) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (!value || (key === "status" && value === "active")) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  const businessDefaults = {
    currency: settingsQuery.data?.settings?.defaultCurrency ?? "USD",
    hourlyRate: settingsQuery.data?.settings?.defaultHourlyRate ?? null,
  };

  return (
    <main>
      <PageHeader
        title="Clients"
        description="Manage client contact details and defaults for future billable work."
        actions={
          <Button onClick={() => setEditor({ mode: "create" })}>
            <Plus aria-hidden="true" size={17} />
            New client
          </Button>
        }
      />

      <div className="grid gap-5 px-5 py-6 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="grid flex-1 gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
            Search clients
            <span className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                size={17}
              />
              <TextInput
                type="search"
                value={search}
                placeholder="Search by client name"
                className="pl-9"
                onChange={(event) => updateFilter("search", event.target.value)}
              />
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--color-text-primary)] sm:w-44">
            Status
            <Select
              value={status}
              onChange={(event) => updateFilter("status", event.target.value)}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </Select>
          </label>
        </div>

        {clientsQuery.isPending ? <Spinner label="Loading clients" /> : null}
        {clientsQuery.isError ? (
          <InlineError>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Clients could not be loaded.</span>
              <Button variant="secondary" size="sm" onClick={() => void clientsQuery.refetch()}>
                Try again
              </Button>
            </div>
          </InlineError>
        ) : null}
        {statusMutation.isError && !archiveTarget ? (
          <InlineError>Client status could not be changed. Try again.</InlineError>
        ) : null}
        {clientsQuery.data ? (
          <ClientTable
            clients={clientsQuery.data.clients}
            status={status}
            search={search}
            onEdit={(client) => setEditor({ mode: "edit", client })}
            onArchive={(client) => {
              statusMutation.reset();
              setArchiveTarget(client);
            }}
            onReactivate={(client) => {
              statusMutation.reset();
              statusMutation.mutate({ client, active: true });
            }}
            statusPendingId={
              statusMutation.isPending ? statusMutation.variables.client.id : null
            }
          />
        ) : null}
      </div>

      {editor ? (
        <ClientFormDialog
          client={editor.mode === "edit" ? editor.client : null}
          businessDefaults={businessDefaults}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
        />
      ) : null}

      {archiveTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              statusMutation.reset();
              setArchiveTarget(null);
            }
          }}
          title={`Archive ${archiveTarget.name}?`}
          description="Historical time and invoices will remain available. The client will be excluded from new-work selection until reactivated."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button
                variant="danger"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ client: archiveTarget, active: false })}
              >
                {statusMutation.isPending ? "Archiving…" : "Archive client"}
              </Button>
            </>
          }
        >
          {statusMutation.isError ? (
            <InlineError>Client status could not be changed.</InlineError>
          ) : (
            <p className="m-0 text-sm text-[var(--color-text-secondary)]">
              Archiving does not delete this client or its historical relationships.
            </p>
          )}
        </Dialog>
      ) : null}
    </main>
  );
}

function ClientTable({
  clients,
  onArchive,
  onEdit,
  onReactivate,
  search,
  status,
  statusPendingId,
}: {
  clients: ClientDto[];
  onArchive: (client: ClientDto) => void;
  onEdit: (client: ClientDto) => void;
  onReactivate: (client: ClientDto) => void;
  search: string;
  status: "active" | "archived" | "all";
  statusPendingId: string | null;
}) {
  if (clients.length === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-6 py-12 text-center">
        <h2 className="m-0 text-base font-semibold text-[var(--color-text-primary)]">
          {search ? "No clients match this search" : status === "active" ? "No active clients yet" : "No clients in this view"}
        </h2>
        <p className="mx-auto mb-0 mt-2 max-w-lg text-sm text-[var(--color-text-secondary)]">
          {search
            ? "Try another name or clear the search."
            : status === "active"
              ? "Create your first client to organize projects and billable work."
              : "Choose another status to review your client records."}
        </p>
      </section>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="bg-[var(--color-bg-subtle)] text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          <tr>
            <th scope="col" className="px-4 py-3">Client</th>
            <th scope="col" className="px-4 py-3">Currency</th>
            <th scope="col" className="px-4 py-3">Hourly rate</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr
              key={client.id}
              className="border-t border-[var(--color-border-default)] hover:bg-[var(--color-bg-subtle)]"
            >
              <th scope="row" className="px-4 py-3 font-medium text-[var(--color-text-primary)]">
                <span className="block">{client.name}</span>
                {client.email ? (
                  <span className="mt-0.5 block text-xs font-normal text-[var(--color-text-muted)]">
                    {client.email}
                  </span>
                ) : null}
              </th>
              <td className="px-4 py-3 font-medium">{client.currency}</td>
              <td className="px-4 py-3 tabular-nums text-[var(--color-text-secondary)]">
                {client.defaultHourlyRate === null
                  ? "Uses business default"
                  : `${client.currency} ${client.defaultHourlyRate}/hr`}
              </td>
              <td className="px-4 py-3">
                <StatusBadge tone={client.active ? "success" : "neutral"}>
                  {client.active ? "Active" : "Archived"}
                </StatusBadge>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button variant="quiet" size="sm" onClick={() => onEdit(client)}>
                    <Pencil aria-hidden="true" size={15} />
                    Edit
                  </Button>
                  {client.active ? (
                    <Button variant="quiet" size="sm" onClick={() => onArchive(client)}>
                      <Archive aria-hidden="true" size={15} />
                      Archive
                    </Button>
                  ) : (
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={statusPendingId === client.id}
                      onClick={() => onReactivate(client)}
                    >
                      <RotateCcw aria-hidden="true" size={15} />
                      {statusPendingId === client.id ? "Reactivating…" : "Reactivate"}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
