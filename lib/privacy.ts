import { contentVersion } from "@/lib/content-version";

export const DEFAULT_RETENTION_YEARS = 7;

/**
 * How long records are kept, as stated in the notice below.
 *
 * Seven years is the usual floor for Australian construction and employment
 * records, but the right figure depends on the contracts a business works
 * under. Set DATA_RETENTION_YEARS to whatever has been decided; changing it
 * changes the notice text, and therefore its version, so acceptances recorded
 * against the old wording remain distinguishable.
 */
export function retentionYears(
  env: Record<string, string | undefined> = process.env
): number {
  const parsed = Number(env.DATA_RETENTION_YEARS);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 30
    ? Math.floor(parsed)
    : DEFAULT_RETENTION_YEARS;
}

export interface PrivacySection {
  heading: string;
  body: string;
}

/**
 * The collection notice shown wherever personal information is first entered.
 *
 * This is a plain-language draft covering what the Australian Privacy Act
 * expects at the point of collection: what is taken, why, who sees it, how long
 * it is kept, and how to get at it. It is not legal advice and should be read
 * by whoever is accountable for the business's privacy obligations before it is
 * relied on. Editing any of this text changes the version automatically.
 */
export function privacySections(
  options?: { years?: number; contact?: string }
): PrivacySection[] {
  const years = options?.years ?? retentionYears();
  const contact =
    options?.contact ||
    process.env.PRIVACY_CONTACT ||
    "the site manager or your R2G contact";

  return [
    {
      heading: "What we collect",
      body: "Your name, a photograph of you, your contact details, the company you work for, your work role, the ticket and licence numbers and card photographs you give us, your emergency contact, and a record of each time you sign in to and out of a site. Sign-ins also record the time, the site, and the network address of the device used.",
    },
    {
      heading: "Why we collect it",
      body: "To know who is on each site, so that everyone can be accounted for in an evacuation; to confirm you hold the tickets the work requires; and to keep the site attendance record that construction sites are required to keep.",
    },
    {
      heading: "Who can see it",
      body: "Site managers and administrators of this register. Your name, photograph and contact number appear on the evacuation list used at a muster point. We do not sell your information or use it for marketing.",
    },
    {
      heading: "How long we keep it",
      body: `Attendance and induction records are kept for ${years} years, which is the period these records may need to be produced for. Contact details are removed sooner if you ask and there is no record we still need to hold.`,
    },
    {
      heading: "Your choices",
      body: `You can ask to see what we hold about you, correct anything wrong, or ask us to delete it, by contacting ${contact}. Giving us this information is voluntary, but without it we cannot let you onto a site.`,
    },
  ];
}

/** The notice as one block of text, used for versioning and for a snapshot. */
export function privacyText(options?: { years?: number; contact?: string }): string {
  return privacySections(options)
    .map((s) => `${s.heading}\n${s.body}`)
    .join("\n\n");
}

/** Changes whenever the notice wording or the retention period changes. */
export function privacyVersion(options?: {
  years?: number;
  contact?: string;
}): string {
  return contentVersion("privacy", privacyText(options));
}

export interface PrivacyAcceptance {
  PrivacyAcceptedAt: string;
  PrivacyVersion: string;
}

/**
 * The fields recording that someone accepted the notice.
 *
 * The version is stored rather than a bare "yes", so it stays possible to say
 * which wording a given person actually agreed to.
 */
export function privacyAcceptance(acceptedAt: string): PrivacyAcceptance {
  return {
    PrivacyAcceptedAt: acceptedAt,
    PrivacyVersion: privacyVersion(),
  };
}
