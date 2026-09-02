import { describe, expect, it } from "vitest";
import {
  MAX_CARD_IMAGE_BYTES,
  MIN_CARD_IMAGE_BYTES,
  acceptedCardImage,
  cardImageCreateFields,
  cardImagePatchFields,
  isCardImage,
} from "@/lib/media";

/** A JPEG data URL of a given decoded size, for the size-bound checks. */
const jpegOf = (bytes: number) =>
  `data:image/jpeg;base64,${"A".repeat(Math.ceil(bytes / 3) * 4)}`;

const pngOf = (bytes: number) =>
  `data:image/png;base64,${"A".repeat(Math.ceil(bytes / 3) * 4)}`;

const plausible = jpegOf(20_000);

describe("isCardImage", () => {
  it("accepts a plausible JPEG data URL", () => {
    expect(isCardImage(plausible)).toBe(true);
  });

  it("accepts a plausible PNG data URL", () => {
    expect(isCardImage(pngOf(20_000))).toBe(true);
  });

  const body = plausible.split(",")[1];

  it.each([
    ["an SVG, which can carry script", `data:image/svg+xml;base64,${body}`],
    ["a GIF", `data:image/gif;base64,${body}`],
    ["text/html wearing a data URL", `data:text/html;base64,${body}`],
    ["a media type that merely ends in jpeg", `data:image/x-jpeg;base64,${body}`],
    ["image/jpg, which is not a real media type", `data:image/jpg;base64,${body}`],
    ["a bare URL", "https://example.com/card.jpg"],
    ["raw base64 with no prefix", body],
    ["an empty string", ""],
  ])("rejects %s", (_label, value) => {
    expect(isCardImage(value)).toBe(false);
  });

  it.each([null, undefined, 42, {}, []])("rejects the non-string %p", (value) => {
    expect(isCardImage(value)).toBe(false);
  });

  it("rejects something too small to be a photograph", () => {
    expect(isCardImage(jpegOf(MIN_CARD_IMAGE_BYTES - 100))).toBe(false);
  });

  it("rejects an image large enough to blow the registration body", () => {
    expect(isCardImage(jpegOf(MAX_CARD_IMAGE_BYTES + 5000))).toBe(false);
  });

  it("rejects base64 containing characters that are not base64", () => {
    expect(isCardImage(`data:image/jpeg;base64,${"<".repeat(4000)}`)).toBe(false);
  });
});

describe("acceptedCardImage", () => {
  it.each([null, undefined, "", "   "])("treats %p as no photo", (value) => {
    expect(acceptedCardImage(value)).toEqual({ image: null });
  });

  it("returns a valid photo unchanged", () => {
    expect(acceptedCardImage(plausible)).toEqual({ image: plausible });
  });

  it("names the problem rather than storing a rejected photo", () => {
    const result = acceptedCardImage("data:image/svg+xml;base64,AAAA");
    expect(result.image).toBeNull();
    expect(result.error).toMatch(/could not be stored/i);
  });
});

describe("cardImageCreateFields", () => {
  it("omits missing photos so the columns need not exist yet", () => {
    expect(cardImageCreateFields(undefined, "")).toEqual({ fields: {} });
  });

  it("writes only the photos that were actually taken", () => {
    expect(cardImageCreateFields(plausible, null)).toEqual({
      fields: { WhiteCardImage: plausible },
    });
  });

  it("writes a face photo when one was taken", () => {
    expect(cardImageCreateFields(null, null, plausible)).toEqual({
      fields: { PersonPhoto: plausible },
    });
  });

  it("refuses a bad photo rather than storing it", () => {
    const result = cardImageCreateFields("not-an-image", null);
    expect(result.fields).toEqual({});
    expect(result.error).toBeTruthy();
  });
});

describe("cardImagePatchFields", () => {
  it("leaves photos alone when the keys were not sent", () => {
    expect(cardImagePatchFields({ FirstName: "Sam" })).toEqual({ fields: {} });
  });

  it("clears a photo when the key is sent as null", () => {
    expect(cardImagePatchFields({ WhiteCardImage: null })).toEqual({
      fields: { WhiteCardImage: null },
    });
  });

  it("stores a valid replacement", () => {
    expect(cardImagePatchFields({ LicenceImage: plausible })).toEqual({
      fields: { LicenceImage: plausible },
    });
  });

  it("clears a face photo when the key is sent as null", () => {
    expect(cardImagePatchFields({ PersonPhoto: null })).toEqual({
      fields: { PersonPhoto: null },
    });
  });
});
