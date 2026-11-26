import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSuggestions, type KnownCity } from "../supabase/functions/_shared/suggest.ts";

const CITIES: KnownCity[] = [
  { names: ["Modi'in-Maccabim-Re'ut", "מודיעין-מכבים-רעות", "Modi'in", "Modiin", "מודיעין"], lat: 31.898, lon: 35.0104 },
  { names: ["Herzliya", "הרצליה"], lat: 32.1663, lon: 34.8434 },
  { names: ["Bat Yam", "בת ים"], lat: 32.0171, lon: 34.7454 },
];

// What the place search returned for "Modiin" (6 copies): one city, five streets called Modiin in other towns.
const MODIIN = [
  { id: "g1", label: "Modiin", sublabel: "Ramla Subdistrict, Israel", lat: 31.9085744, lon: 35.0069297 },
  { id: "g2", label: "Modiin", sublabel: "4532302 Hod HaSharon, Israel", lat: 32.1387956, lon: 34.8991408 },
  { id: "g3", label: "Modiin", sublabel: "4853313 Rosh HaAyin, Israel", lat: 32.1021884, lon: 34.953442 },
  { id: "g4", label: "Modiin", sublabel: "4675095 Herzliya, Israel", lat: 32.166746, lon: 34.8009437 },
  { id: "g5", label: "Modiin", sublabel: "5850905 Bat Yam, Israel", lat: 32.0124287, lon: 34.7598168 },
  { id: "g6", label: "Modiin", sublabel: "3079566 Pardes Hana-Karkur, Israel", lat: 32.4677683, lon: 34.9597377 },
];

test('"Modiin": 6 copies become 1 (the city); the others claim Modiin but sit 20+ km away', () => {
  assert.deepEqual(cleanSuggestions(MODIIN, "Modiin", CITIES).map((s) => s.id), ["g1"]);
});

test("same name within 3 km is one place; keeps the most complete address", () => {
  const list = [
    { id: "a", label: "Azrieli Modiin", sublabel: "Modi'in-Maccabim-Re'ut", lat: 31.9, lon: 35.007 },
    { id: "b", label: "Azrieli Modiin", sublabel: "Lev HaIr, Modi'in-Maccabim-Re'ut, 7170000, Israel", lat: 31.901, lon: 35.008 },
    { id: "c", label: "Modi'in Center", sublabel: "Modi'in-Maccabim-Re'ut", lat: 31.901, lon: 35.0057 },
  ];
  assert.deepEqual(cleanSuggestions(list, "Modiin", CITIES).map((s) => s.id), ["b", "c"]);
});

test("same name far apart stays as two places", () => {
  const list = [
    { id: "a", label: "Aroma", sublabel: "Herzliya", lat: 32.166, lon: 34.843 },
    { id: "b", label: "Aroma", sublabel: "Bat Yam", lat: 32.017, lon: 34.745 },
  ];
  assert.equal(cleanSuggestions(list, "Aroma", CITIES).length, 2);
});

test("an address whose city doesn't match its coordinates is dropped", () => {
  const list = [{ id: "x", label: "HaNasi 10", sublabel: "Herzliya, 4675095", lat: 31.9, lon: 35.0 }];
  assert.equal(cleanSuggestions(list, "HaNasi 10", CITIES).length, 0);
});
