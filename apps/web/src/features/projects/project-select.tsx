import { Select } from "@verilio/ui";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, type SelectHTMLAttributes } from "react";

import { getProjects, projectKeys } from "./project-api.js";

export type ProjectSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children"
> & {
  clientId?: string | null;
  includeArchived?: boolean;
  placeholder?: string;
};

export const ProjectSelect = forwardRef<HTMLSelectElement, ProjectSelectProps>(
  function ProjectSelect(
    {
      clientId,
      disabled,
      includeArchived = false,
      placeholder = "Select a project",
      ...props
    },
    ref,
  ) {
    const query = {
      status: includeArchived ? ("all" as const) : ("active" as const),
      clientId: clientId || undefined,
      search: "",
      availability: includeArchived ? ("all" as const) : ("new-work" as const),
    };
    const projectsQuery = useQuery({
      queryKey: projectKeys.list(query),
      queryFn: () => getProjects(query),
      enabled: Boolean(clientId),
    });
    const projects = (projectsQuery.data?.projects ?? []).filter(
      (project) =>
        project.clientId === clientId && (includeArchived || project.active),
    );

    const emptyLabel = !clientId
      ? "Select a client first"
      : projectsQuery.isPending
        ? "Loading projects…"
        : projectsQuery.isError
          ? "Projects unavailable"
          : projects.length === 0
            ? "No active projects"
            : placeholder;

    return (
      <Select
        ref={ref}
        disabled={disabled || !clientId || projectsQuery.isPending || projectsQuery.isError}
        aria-busy={Boolean(clientId) && projectsQuery.isPending}
        {...props}
      >
        <option value="">{emptyLabel}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
            {!project.active ? " — Archived" : ""}
          </option>
        ))}
      </Select>
    );
  },
);
