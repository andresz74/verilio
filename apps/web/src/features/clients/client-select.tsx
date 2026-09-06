import { Select } from "@verilio/ui";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, type SelectHTMLAttributes } from "react";

import { clientKeys, getClients } from "./client-api.js";

export type ClientSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children"
> & {
  includeArchived?: boolean;
  placeholder?: string;
};

export const ClientSelect = forwardRef<HTMLSelectElement, ClientSelectProps>(
  function ClientSelect(
    {
      disabled,
      includeArchived = false,
      placeholder = "Select a client",
      ...props
    },
    ref,
  ) {
    const query = {
      status: includeArchived ? ("all" as const) : ("active" as const),
      search: "",
    };
    const clientsQuery = useQuery({
      queryKey: clientKeys.list(query),
      queryFn: () => getClients(query),
    });
    const clients = (clientsQuery.data?.clients ?? []).filter(
      (client) => includeArchived || client.active,
    );

    return (
      <Select
        ref={ref}
        disabled={disabled || clientsQuery.isPending || clientsQuery.isError}
        aria-busy={clientsQuery.isPending}
        {...props}
      >
        <option value="">
          {clientsQuery.isPending
            ? "Loading clients…"
            : clientsQuery.isError
              ? "Clients unavailable"
              : placeholder}
        </option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name} — {client.currency}
            {!client.active ? " — Archived" : ""}
          </option>
        ))}
      </Select>
    );
  },
);
