const turkishCharacters =
  "\u00e7\u00c7\u011f\u011e\u0131I\u0130i\u00f6\u00d6\u015f\u015e\u00fc\u00dc";

export const TURKISH_LOCALE = "tr-TR";

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

const mojibakeMap: Record<string, string> = {
  "\u00c3\u00a7": "\u00e7",
  "\u00c3\u0087": "\u00c7",
  "\u00c4\u009f": "\u011f",
  "\u00c4\u009e": "\u011e",
  "\u00c4\u00b1": "\u0131",
  "\u00c4\u00b0": "\u0130",
  "\u00c3\u00b6": "\u00f6",
  "\u00c3\u0096": "\u00d6",
  "\u00c5\u009f": "\u015f",
  "\u00c5\u009e": "\u015e",
  "\u00c3\u00bc": "\u00fc",
  "\u00c3\u009c": "\u00dc",
  "\u00e2\u0080\u0093": "-",
  "\u00e2\u0080\u0094": "-",
  "\u00e2\u0080\u0098": "'",
  "\u00e2\u0080\u0099": "'",
  "\u00e2\u0080\u009c": "\"",
  "\u00e2\u0080\u009d": "\""
};

export const preserveUtf8 = (value: string) => repairCommonMojibake(String(value ?? "")).normalize("NFC");

export const toTurkishLower = (value: string) => preserveUtf8(value).toLocaleLowerCase(TURKISH_LOCALE);

export const toTurkishUpper = (value: string) => preserveUtf8(value).toLocaleUpperCase(TURKISH_LOCALE);

export const includesTurkishInsensitive = (value: string, query: string) =>
  toTurkishLower(value).includes(toTurkishLower(query));

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

function repairCommonMojibake(value: string) {
  let repaired = value;
  for (const [broken, fixed] of Object.entries(mojibakeMap)) {
    repaired = repaired.split(broken).join(fixed);
  }
  return repaired;
}
