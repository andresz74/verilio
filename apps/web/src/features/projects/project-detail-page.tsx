import type { ClientDto, ProjectDto } from "@verilio/contracts";
import {
  Button,
  Dialog,
  DialogClose,
  InlineError,
  Spinner,
  StatusBadge,
} from "@verilio/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, Pencil, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { PageHeader } from "../../app/app-shell.js";
import { clientKeys, getClients } from "../clients/client-api.js";
import { getSettings } from "../settings/settings-api.js";
import { ProjectTasks } from "../tasks/project-tasks.js";
import {
  archiveProject,
  getProject,
  projectKeys,
  reactivateProject,
} from "./project-api.js";
import { ProjectFormDialog } from "./project-form-dialog.js";

export function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const projectQuery = useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProject(projectId),
    enabled: Boolean(projectId),
  });
  const allClientsQuery = { status: "all" as const, search: "" };
  const clientsQuery = useQuery({
    queryKey: clientKeys.list(allClientsQuery),
    queryFn: () => getClients(allClientsQuery),
  });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const statusMutation = useMutation({
    mutationFn: (active: boolean) =>
      active ? reactivateProject(projectId) : archiveProject(projectId),
    onSuccess: (response) => {
      queryClient.setQueryData(projectKeys.detail(projectId), response);
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      setArchiveOpen(false);
    },
  });

  if (!projectId) {
    return <InlineError>Project could not be identified.</InlineError>;
  }
  if (projectQuery.isPending) {
    return <div className="p-8"><Spinner label="Loading project" /></div>;
  }
  if (projectQuery.isError) {
    return (
      <main className="grid gap-5 p-8">
        <InlineError>Project could not be loaded.</InlineError>
        <Link className="text-sm font-medium text-[var(--color-accent-default)]" to="/projects">
          Return to Projects
        </Link>
      </main>
    );
  }

  const project = projectQuery.data.project;
  const clients = clientsQuery.data?.clients ?? [];
  const client = clients.find((candidate) => candidate.id === project.clientId) ?? null;
  const defaults = {
    businessCurrency: settingsQuery.data?.settings?.defaultCurrency ?? "USD",
    businessRate: settingsQuery.data?.settings?.defaultHourlyRate ?? null,
    clients,
  };

  return (
    <main>
      <PageHeader
        title={project.name}
        description={client ? `Project for ${client.name}` : "Project details"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" size={16} /> Edit project
            </Button>
            {project.active ? (
              <Button variant="quiet" onClick={() => setArchiveOpen(true)}>
                <Archive aria-hidden="true" size={16} /> Archive
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate(true)}
              >
                <RotateCcw aria-hidden="true" size={16} />
                {statusMutation.isPending ? "Reactivating…" : "Reactivate"}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-5 px-5 py-6 sm:px-8 lg:px-10">
        <Link
          to="/projects"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)] no-underline hover:text-[var(--color-accent-default)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
        >
          <ArrowLeft aria-hidden="true" size={16} /> Back to Projects
        </Link>

        {statusMutation.isError && !archiveOpen ? (
          <InlineError>Project status could not be changed. Try again.</InlineError>
        ) : null}

        {!project.active ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
            This project is archived. Its settings and tasks remain available for historical context.
          </div>
        ) : null}
        {client && !client.active ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-warning-default)] bg-[var(--color-warning-subtle)] px-4 py-3 text-sm text-[var(--color-warning-default)]">
            The client is archived, so this project is excluded from new-work selection. The project itself has not been archived.
          </div>
        ) : null}

        <ProjectTasks projectId={project.id} />

        <div className="grid gap-5 lg:grid-cols-2">
          <DetailCard title="Notes">
            <p className="m-0 whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
              {project.note || "No project notes."}
            </p>
          </DetailCard>
          <DetailCard title="Settings">
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
              <dt className="text-[var(--color-text-muted)]">Client</dt>
              <dd className="m-0 font-medium text-[var(--color-text-primary)]">
                {client?.name ?? "Unavailable client"}
              </dd>
              <dt className="text-[var(--color-text-muted)]">Hourly rate</dt>
              <dd className="m-0 text-[var(--color-text-primary)]">
                {rateDescription(project, client, defaults.businessRate, defaults.businessCurrency)}
              </dd>
              <dt className="text-[var(--color-text-muted)]">New time</dt>
              <dd className="m-0 text-[var(--color-text-primary)]">
                {project.billableByDefault ? "Billable by default" : "Non-billable by default"}
              </dd>
              <dt className="text-[var(--color-text-muted)]">Status</dt>
              <dd className="m-0">
                <StatusBadge tone={project.active ? "success" : "neutral"}>
                  {project.active ? "Active" : "Archived"}
                </StatusBadge>
              </dd>
            </dl>
          </DetailCard>
        </div>
      </div>

      {editing ? (
        <ProjectFormDialog
          project={project}
          defaults={defaults}
          onOpenChange={(open) => setEditing(open)}
        />
      ) : null}

      {archiveOpen ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              statusMutation.reset();
              setArchiveOpen(false);
            }
          }}
          title={`Archive ${project.name}?`}
          description="Tasks and future historical relationships remain available, but this project leaves ordinary new-work selection."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button
                variant="danger"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate(false)}
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
              Archiving preserves the project and all of its tasks.
            </p>
          )}
        </Dialog>
      ) : null}
    </main>
  );
}

function DetailCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5">
      <h2 className="mb-4 mt-0 text-base font-semibold text-[var(--color-text-primary)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function rateDescription(
  project: ProjectDto,
  client: ClientDto | null,
  businessRate: string | null,
  businessCurrency: string,
): string {
  if (project.defaultHourlyRate !== null) {
    return `Project override — ${project.defaultHourlyRate}/hr`;
  }
  if (client?.defaultHourlyRate !== null && client?.defaultHourlyRate !== undefined) {
    return `Inherited from Client — ${client.defaultHourlyRate}/hr`;
  }
  return businessRate === null
    ? "Inherited from Business"
    : `Inherited from Business — ${businessCurrency} ${businessRate}/hr`;
}
