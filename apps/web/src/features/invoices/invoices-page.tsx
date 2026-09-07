import { EmptyState, InlineError, StatusBadge } from "@verilio/ui";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { PageHeader } from "../../app/app-shell.js";
import { formatWorkDate } from "../../shared/date-range.js";
import { getInvoices, invoiceKeys } from "./invoice-api.js";

export function InvoicesPage() {
  const query = useQuery({ queryKey: invoiceKeys.list, queryFn: getInvoices });
  return (
    <main>
      <PageHeader
        title="Invoices"
        description="Create traceable Drafts from verified billable work."
        actions={<LinkButton to="/invoices/new"><Plus aria-hidden="true" size={16} /> New Invoice</LinkButton>}
      />
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 lg:px-10">
        {query.isPending ? <div role="status" aria-label="Loading Invoices" className="h-56 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)]"><span className="sr-only">Loading Invoices…</span></div> : query.isError ? <InlineError>Invoices could not be loaded. <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>Try again</button></InlineError> : query.data.invoices.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6"><EmptyState title="No Invoices yet" description="Create an Invoice when you are ready to bill tracked work." action={<LinkButton to="/invoices/new">Create Invoice</LinkButton>} /></div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-[var(--color-bg-subtle)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Issue date</th><th className="px-4 py-3">Due date</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-[var(--color-border-default)]">
                {query.data.invoices.map((invoice) => <tr key={invoice.id}><th scope="row" className="px-4 py-3 text-left"><Link className="font-semibold text-[var(--color-accent-active)] underline" to={`/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link></th><td className="px-4 py-3">{invoice.clientName}</td><td className="px-4 py-3">{formatWorkDate(invoice.issueDate, "short")}</td><td className="px-4 py-3">{formatWorkDate(invoice.dueDate, "short")}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{invoice.currency} {formatMoney(invoice.total, invoice.currency)}</td><td className="px-4 py-3"><StatusBadge tone="info">Draft</StatusBadge></td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function LinkButton({ children, to }: { children: ReactNode; to: string }) {
  return <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-accent-default)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]" to={to}>{children}</Link>;
}

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
}
