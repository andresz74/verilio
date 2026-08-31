import type { BusinessProfileDto, BusinessProfileInput } from "@verilio/contracts";
import type { VerilioDatabase } from "@verilio/db";
import { businessProfiles, users } from "@verilio/db";
import { eq } from "drizzle-orm";

export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

type BusinessProfileRow = typeof businessProfiles.$inferSelect;

export interface SettingsServiceContract {
  get(): Promise<BusinessProfileDto | null>;
  save(input: BusinessProfileInput): Promise<BusinessProfileDto>;
}

export class SettingsService implements SettingsServiceContract {
  constructor(
    private readonly db: VerilioDatabase,
    private readonly ownerId = LOCAL_USER_ID,
  ) {}

  async get(): Promise<BusinessProfileDto | null> {
    const [profile] = await this.db
      .select()
      .from(businessProfiles)
      .where(eq(businessProfiles.userId, this.ownerId))
      .limit(1);

    return profile ? toDto(profile) : null;
  }

  async save(input: BusinessProfileInput): Promise<BusinessProfileDto> {
    return this.db.transaction(async (transaction) => {
      await transaction
        .insert(users)
        .values({ id: this.ownerId, displayName: input.businessName })
        .onConflictDoUpdate({
          target: users.id,
          set: { displayName: input.businessName, updatedAt: new Date() },
        });

      const now = new Date();
      const values = {
        userId: this.ownerId,
        businessName: input.businessName,
        email: input.email,
        address: input.address,
        phone: emptyToNull(input.phone),
        taxIdentifier: emptyToNull(input.taxIdentifier),
        defaultCurrency: input.defaultCurrency,
        defaultHourlyRate: input.defaultHourlyRate,
        paymentTermsDays: input.paymentTermsDays,
        invoicePrefix: input.invoicePrefix,
        nextInvoiceNumber: input.nextInvoiceNumber,
        defaultTaxRate: input.defaultTaxRate,
        defaultInvoiceNotes: emptyToNull(input.defaultInvoiceNotes),
        invoiceFooter: emptyToNull(input.invoiceFooter),
        timezone: input.timezone,
        updatedAt: now,
      };

      const [profile] = await transaction
        .insert(businessProfiles)
        .values(values)
        .onConflictDoUpdate({
          target: businessProfiles.userId,
          set: values,
        })
        .returning();

      if (!profile) throw new Error("Settings upsert returned no profile");
      return toDto(profile);
    });
  }
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDto(profile: BusinessProfileRow): BusinessProfileDto {
  return {
    id: profile.userId,
    businessName: profile.businessName,
    email: profile.email,
    address: profile.address,
    phone: profile.phone,
    taxIdentifier: profile.taxIdentifier,
    defaultCurrency: profile.defaultCurrency,
    defaultHourlyRate: profile.defaultHourlyRate,
    paymentTermsDays: profile.paymentTermsDays,
    invoicePrefix: profile.invoicePrefix,
    nextInvoiceNumber: profile.nextInvoiceNumber,
    defaultTaxRate: profile.defaultTaxRate,
    defaultInvoiceNotes: profile.defaultInvoiceNotes,
    invoiceFooter: profile.invoiceFooter,
    timezone: profile.timezone,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

