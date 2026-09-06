import {
  IdSchema,
  ProjectStatusFilterSchema,
  type ClientDto,
  type ProjectDto,
} from "@verilio/contracts";
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
import { Archive, ExternalLink, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../app/app-shell.js";
import { clientKeys, getClients } from "../clients/client-api.js";
import { ClientSelect } from "../clients/client-select.js";
import { getSettings } from "../settings/settings-api.js";
import {
  archiveProject,
  getProjects,
  projectKeys,
  reactivateProject,
} from "./project-api.js";
import { ProjectFormDialog } from "./project-form-dialog.js";

type EditorState = { mode: "create" } | { mode: "edit"; project: ProjectDto } | null;

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editor, setEditor] = useState<EditorState>(null);
  const [archiveTarget, setArchiveTarget] = useState<ProjectDto | null>(null);
  const statusResult = ProjectStatusFilterSchema.safeParse(
    searchParams.get("status") ?? "active",
  );
  const clientResult = IdSchema.safeParse(searchParams.get("clientId"));
  const status = statusResult.success ? statusResult.data : "active";
  const clientId = clientResult.success ? clientResult.data : undefined;
  const search = searchParams.get("search") ?? "";
  const projectQuery = { status, clientId, search, availability: "all" as const };
  const projectsQuery = useQuery({
    queryKey: projectKeys.list(projectQuery),
    queryFn: () => getProjects(projectQuery),
  });
  const allClientsQuery = { status: "all" as const, search: "" };
  const clientsQuery = useQuery({
    queryKey: clientKeys.list(allClientsQuery),
    queryFn: () => getClients(allClientsQuery),
  });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const statusMutation = useMutation({
    mutationFn: ({ active, project }: { active: boolean; project: ProjectDto }) =>
      active ? reactivateProject(project.id) : archiveProject(project.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      setArchiveTarget(null);
    },
  });

  const updateFilter = (key: "clientId" | "search" | "status", value: string) => {
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

  const clients = clientsQuery.data?.clients ?? [];
  const defaults = {
    businessCurrency: settingsQuery.data?.settings?.defaultCurrency ?? "USD",
    businessRate: settingsQuery.data?.settings?.defaultHourlyRate ?? null,
    clients,
  };

  return (
    <main>
      <PageHeader
        title="Projects"
        description="Organize client work, billing defaults, and project-specific tasks."
        actions={
          <Button onClick={() => setEditor({ mode: "create" })}>
            <Plus aria-hidden="true" size={17} />
            New project
          </Button>
        }
      />

      <div className="grid gap-5 px-5 py-6 sm:px-8 lg:px-10">
        <div className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_15rem_11rem] sm:items-end">
          <label className="grid gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
            Search projects
            <span className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                size={17}
              />
              <TextInput
                type="search"
                value={search}
                placeholder="Search by project name"
                className="pl-9"
                onChange={(event) => updateFilter("search", event.target.value)}
              />
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
            Client
            <ClientSelect
              includeArchived
              placeholder="All clients"
              value={clientId ?? ""}
              onChange={(event) => updateFilter("clientId", event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
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

        {projectsQuery.isPending ? <Spinner label="Loading projects" /> : null}
        {projectsQuery.isError ? (
          <InlineError>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Projects could not be loaded.</span>
              <Button variant="secondary" size="sm" onClick={() => void projectsQuery.refetch()}>
                Try again
              </Button>
            </div>
          </InlineError>
        ) : null}
        {statusMutation.isError && !archiveTarget ? (
          <InlineError>Project status could not be changed. Try again.</InlineError>
        ) : null}
        {projectsQuery.data ? (
          <ProjectTable
            projects={projectsQuery.data.projects}
            clients={clients}
            businessCurrency={defaults.businessCurrency}
            businessRate={defaults.businessRate}
            status={status}
            search={search}
            statusPendingId={
              statusMutation.isPending ? statusMutation.variables.project.id : null
            }
            onEdit={(project) => setEditor({ mode: "edit", project })}
            onArchive={(project) => {
              statusMutation.reset();
              setArchiveTarget(project);
            }}
            onReactivate={(project) => {
              statusMutation.reset();
              statusMutation.mutate({ project, active: true });
            }}
          />
        ) : null}
      </div>

      {editor ? (
        <ProjectFormDialog
          project={editor.mode === "edit" ? editor.project : null}
          defaults={defaults}
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
          description="Tasks and future historical time relationships will remain available. The project will be excluded from new-work selection until reactivated."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button
                variant="danger"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ project: archiveTarget, active: false })}
              >
                {statusMutation.isPending ? "Archiving…" : "Archive project"}
              </Button>
            </>
          }
        >
          {statusMutation.isError ? (
            <InlineError>Project status could not be changed.</InlineError>
          ) : (
            <p className="m-0 text-sm text-[var(--color-text-secondary)]">
              Archiving does not delete this project, its tasks, or historical relationships.
            </p>
          )}
        </Dialog>
      ) : null}
    </main>
  );
}

function ProjectTable({
  businessCurrency,
  businessRate,
  clients,
  onArchive,
  onEdit,
  onReactivate,
  projects,
  search,
  status,
  statusPendingId,
}: {
  businessCurrency: string;
  businessRate: string | null;
  clients: ClientDto[];
  onArchive: (project: ProjectDto) => void;
  onEdit: (project: ProjectDto) => void;
  onReactivate: (project: ProjectDto) => void;
  projects: ProjectDto[];
  search: string;
  status: "active" | "archived" | "all";
  statusPendingId: string | null;
}) {
  if (projects.length === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-6 py-12 text-center">
        <h2 className="m-0 text-base font-semibold text-[var(--color-text-primary)]">
          {search
            ? "No projects match this search"
            : status === "active"
              ? "No active projects yet"
              : "No projects in this view"}
        </h2>
        <p className="mx-auto mb-0 mt-2 max-w-lg text-sm text-[var(--color-text-secondary)]">
          Create a project beneath a client to organize billable work and tasks.
        </p>
      </section>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
      <table className="w-full min-w-[840px] border-collapse text-left text-sm">
        <thead className="bg-[var(--color-bg-subtle)] text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          <tr>
            <th scope="col" className="px-4 py-3">Project</th>
            <th scope="col" className="px-4 py-3">Client</th>
            <th scope="col" className="px-4 py-3">Hourly rate</th>
            <th scope="col" className="px-4 py-3">Default</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const client = clients.find((candidate) => candidate.id === project.clientId) ?? null;
            return (
              <tr
                key={project.id}
                className="border-t border-[var(--color-border-default)] hover:bg-[var(--color-bg-subtle)]"
              >
                <th scope="row" className="px-4 py-3 font-medium text-[var(--color-text-primary)]">
                  <Link
                    className="inline-flex items-center gap-2 text-inherit no-underline hover:text-[var(--color-accent-default)]"
                    to={`/projects/${project.id}`}
                  >
                    {project.color ? (
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full border border-[var(--color-border-default)]"
                        style={{ backgroundColor: project.color }}
                      />
                    ) : null}
                    {project.name}
                    <ExternalLink aria-hidden="true" size={13} />
                  </Link>
                </th>
                <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                  {client?.name ?? "Unavailable client"}
                  {client && !client.active ? (
                    <span className="mt-0.5 block text-xs text-[var(--color-warning-default)]">
                      Client archived
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--color-text-secondary)]">
                  {rateLabel(project, client, businessRate, businessCurrency)}
                </td>
                <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                  {project.billableByDefault ? "Billable" : "Non-billable"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={project.active ? "success" : "neutral"}>
                    {project.active ? "Active" : "Archived"}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="quiet" size="sm" onClick={() => onEdit(project)}>
                      <Pencil aria-hidden="true" size={15} /> Edit
                    </Button>
                    {project.active ? (
                      <Button variant="quiet" size="sm" onClick={() => onArchive(project)}>
                        <Archive aria-hidden="true" size={15} /> Archive
                      </Button>
                    ) : (
                      <Button
                        variant="quiet"
                        size="sm"
                        disabled={statusPendingId === project.id}
                        onClick={() => onReactivate(project)}
                      >
                        <RotateCcw aria-hidden="true" size={15} />
                        {statusPendingId === project.id ? "Reactivating…" : "Reactivate"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function rateLabel(
  project: ProjectDto,
  client: ClientDto | null,
  businessRate: string | null,
  businessCurrency: string,
): string {
  if (project.defaultHourlyRate !== null) {
    return `${project.defaultHourlyRate}/hr override`;
  }
  if (client?.defaultHourlyRate !== null && client?.defaultHourlyRate !== undefined) {
    return `Inherits Client ${client.defaultHourlyRate}/hr`;
  }
  return businessRate === null
    ? "Inherits Business default"
    : `Inherits Business ${businessCurrency} ${businessRate}/hr`;
}
