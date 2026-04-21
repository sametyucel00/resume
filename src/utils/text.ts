const turkishCharacters =
  "\u00e7\u00c7\u011f\u011e\u0131I\u0130i\u00f6\u00d6\u015f\u015e\u00fc\u00dc";

const turkishSlugMap: Record<string, string> = {
  "\u00e7": "c",
  "\u00c7": "c",
  "\u011f": "g",
  "\u011e": "g",
  "\u0131": "i",
  I: "i",
  "\u0130": "i",
  i: "i",
  "\u00f6": "o",
  "\u00d6": "o",
  "\u015f": "s",
  "\u015e": "s",
  "\u00fc": "u",
  "\u00dc": "u",
};

export const preserveUtf8 = (value: string) => value.normalize("NFC");

export const splitLines = (value: string) =>
  preserveUtf8(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

export const splitCsv = (value: string) =>
  preserveUtf8(value)
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

export const containsTurkishCharacters = (value: string) => {
  for (const char of turkishCharacters) {
    if (value.includes(char)) return true;
  }
  return false;
};

export const transliterateTurkish = (value: string) =>
  preserveUtf8(value).replace(
    /[\u00e7\u00c7\u011f\u011e\u0131I\u0130i\u00f6\u00d6\u015f\u015e\u00fc\u00dc]/g,
    (char) => turkishSlugMap[char] ?? char,
  );

export const slugifyPreservingTurkish = (value: string) =>
  transliterateTurkish(value)
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cv";

export const shortId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
