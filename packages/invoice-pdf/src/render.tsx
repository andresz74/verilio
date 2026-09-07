import type { InvoicePresentationModel } from "@verilio/contracts";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

const styles = StyleSheet.create({
  page: { padding: 42, color: "#172033", fontFamily: "Helvetica", fontSize: 9.5 },
  accent: { height: 4, backgroundColor: "#4f46e5", marginBottom: 28 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 26 },
  brand: { fontSize: 18, fontWeight: 700, color: "#3730a3" },
  invoiceTitle: { fontSize: 22, fontWeight: 700, textAlign: "right" },
  muted: { color: "#667085" },
  meta: { marginTop: 7, gap: 3, textAlign: "right" },
  parties: { flexDirection: "row", gap: 30, marginBottom: 26 },
  party: { flexGrow: 1, width: "50%" },
  eyebrow: { marginBottom: 7, color: "#667085", fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 },
  partyName: { marginBottom: 4, fontSize: 11, fontWeight: 700 },
  line: { marginBottom: 2, lineHeight: 1.35 },
  table: { borderWidth: 1, borderColor: "#d7dce5", borderRadius: 3 },
  tableHeader: { flexDirection: "row", backgroundColor: "#eef0ff", borderBottomWidth: 1, borderBottomColor: "#d7dce5", paddingVertical: 7, paddingHorizontal: 8, fontSize: 8, fontWeight: 700, color: "#3730a3" },
  tableRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#e8ebf0" },
  description: { width: "49%", paddingRight: 8 },
  quantity: { width: "15%", textAlign: "right" },
  rate: { width: "18%", textAlign: "right" },
  amount: { width: "18%", textAlign: "right" },
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 18 },
  totals: { width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grandTotal: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 9, borderTopWidth: 1.5, borderTopColor: "#172033", fontSize: 13, fontWeight: 700 },
  section: { marginTop: 23 },
  sectionTitle: { marginBottom: 6, fontSize: 9, fontWeight: 700, color: "#3730a3" },
  paragraph: { lineHeight: 1.45 },
  footer: { position: "absolute", bottom: 28, left: 42, right: 42, color: "#667085", fontSize: 8, textAlign: "center" },
});

export async function renderInvoicePdf(model: InvoicePresentationModel): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument model={model} />);
}

function InvoiceDocument({ model }: { model: InvoicePresentationModel }) {
  return (
    <Document title={`Invoice ${model.invoiceNumber}`} author={model.seller.businessName} subject={`Invoice ${model.invoiceNumber}`} creationDate={dateOnlyUtc(model.issueDate)} modificationDate={dateOnlyUtc(model.issueDate)}>
      <Page size="A4" style={styles.page}>
        <View style={styles.accent} />
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>VERILIO</Text>
            <Text style={[styles.muted, { marginTop: 5 }]}>Track your work. Bill with confidence.</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <View style={styles.meta}>
              <Text>{model.invoiceNumber}</Text>
              <Text>Issued {formatDate(model.issueDate)}</Text>
              <Text>Due {formatDate(model.dueDate)}</Text>
              <Text>Status: {statusLabel(model.displayStatus)}</Text>
              {model.paidAt ? <Text>Paid {formatDate(model.paidAt)}</Text> : null}
            </View>
          </View>
        </View>

        <View style={styles.parties}>
          <Party title="From" name={model.seller.businessName} lines={[model.seller.email, model.seller.address, model.seller.phone, model.seller.taxIdentifier ? `Tax ID: ${model.seller.taxIdentifier}` : null]} />
          <Party title="Bill to" name={model.client.name} lines={[model.client.email, model.client.address, model.client.ccRecipients.length ? `CC: ${model.client.ccRecipients.join(", ")}` : null]} />
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            <Text style={styles.description}>Description</Text>
            <Text style={styles.quantity}>Quantity</Text>
            <Text style={styles.rate}>Unit price</Text>
            <Text style={styles.amount}>Amount</Text>
          </View>
          {model.items.map((item) => (
            <View key={item.id} style={styles.tableRow} wrap={false}>
              <Text style={styles.description}>{item.description}</Text>
              <Text style={styles.quantity}>{formatQuantity(item.quantity)}</Text>
              <Text style={styles.rate}>{formatMoney(item.unitPrice, model.currency)}</Text>
              <Text style={styles.amount}>{formatMoney(item.amount, model.currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.totals}>
            <Total label="Subtotal" value={formatMoney(model.subtotal, model.currency)} />
            {model.discountAmount !== zeroFor(model.currency) ? <Total label="Discount" value={`-${formatMoney(model.discountAmount, model.currency)}`} /> : null}
            <Total label="Taxable subtotal" value={formatMoney(model.taxableSubtotal, model.currency)} />
            <Total label={model.taxPercent === "0" ? "Tax" : `Tax (${trimDecimal(model.taxPercent)}%)`} value={formatMoney(model.taxAmount, model.currency)} />
            <View style={styles.grandTotal}><Text>Total</Text><Text>{model.currency} {formatMoney(model.total, model.currency)}</Text></View>
          </View>
        </View>

        {model.notes ? <Section title="Notes" text={model.notes} /> : null}
        <Section title="Payment terms" text={model.paymentTermsLabel} />
        {model.footer ? <Text style={styles.footer} fixed>{model.footer}</Text> : null}
      </Page>
    </Document>
  );
}

function Party({ title, name, lines }: { title: string; name: string; lines: Array<string | null> }) {
  return <View style={styles.party}><Text style={styles.eyebrow}>{title}</Text><Text style={styles.partyName}>{name}</Text>{lines.filter(Boolean).map((line) => <Text key={line} style={styles.line}>{line}</Text>)}</View>;
}

function Total({ label, value }: { label: string; value: string }) {
  return <View style={styles.totalRow}><Text style={styles.muted}>{label}</Text><Text>{value}</Text></View>;
}

function Section({ title, text }: { title: string; text: string }) {
  return <View style={styles.section} wrap={false}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.paragraph}>{text}</Text></View>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(dateOnlyUtc(value));
}

function dateOnlyUtc(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function formatMoney(value: string, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
}

function formatQuantity(value: string): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(Number(value));
}

function statusLabel(status: InvoicePresentationModel["displayStatus"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function trimDecimal(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function zeroFor(currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits === 0 ? "0" : "0.00";
}
