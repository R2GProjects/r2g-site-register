/** Largest card photo accepted, before base64 expansion. */
export const MAX_CARD_IMAGE_BYTES = 300 * 1024;
export const MIN_CARD_IMAGE_BYTES = 2 * 1024;

/**
 * Whether a value is a card photograph the app is willing to store.
 *
 * JPEG and PNG only — SVG can carry script, and this field is rendered as an
 * image on the admin page. Size is capped so a phone camera dump cannot blow
 * the JSON body limit on registration.
 */
export function isCardImage(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    value.trim()
  );
  if (!match) return false;
  const bytes = Math.floor((match[2].length * 3) / 4);
  return bytes >= MIN_CARD_IMAGE_BYTES && bytes <= MAX_CARD_IMAGE_BYTES;
}

export function acceptedCardImage(
  value: unknown
): { image: string | null; error?: string } {
  if (value === null || value === undefined || String(value).trim() === "") {
    return { image: null };
  }
  if (!isCardImage(value)) {
    return {
      image: null,
      error:
        "That card photo could not be stored. Take it again as a JPEG or PNG, and keep it under a few hundred kilobytes.",
    };
  }
  return { image: String(value).trim() };
}

/**
 * Images to write on create. Empty or missing photos are omitted so the
 * columns need not exist until the first real upload.
 */
export function cardImageCreateFields(
  whiteCardImage: unknown,
  licenceImage: unknown
): { fields: Record<string, unknown>; error?: string } {
  const white = acceptedCardImage(whiteCardImage);
  if (white.error) return { fields: {}, error: white.error };
  const licence = acceptedCardImage(licenceImage);
  if (licence.error) return { fields: {}, error: licence.error };
  const fields: Record<string, unknown> = {};
  if (white.image) fields.WhiteCardImage = white.image;
  if (licence.image) fields.LicenceImage = licence.image;
  return { fields };
}

/**
 * Images to write on update. A present key, including null, is applied so an
 * administrator can clear a photo. Keys that were not sent are left alone.
 */
export function cardImagePatchFields(body: Record<string, unknown>): {
  fields: Record<string, unknown>;
  error?: string;
} {
  const fields: Record<string, unknown> = {};
  if ("WhiteCardImage" in body) {
    const white = acceptedCardImage(body.WhiteCardImage);
    if (white.error) return { fields: {}, error: white.error };
    fields.WhiteCardImage = white.image;
  }
  if ("LicenceImage" in body) {
    const licence = acceptedCardImage(body.LicenceImage);
    if (licence.error) return { fields: {}, error: licence.error };
    fields.LicenceImage = licence.image;
  }
  return { fields };
}
