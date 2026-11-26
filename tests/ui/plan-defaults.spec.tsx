// New-form defaults (RULES.md 21). No network.
import { expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useRouteContext: () => ({ prefs: { lang: "en", theme: "light" } }),
  useRouter: () => ({ invalidate: () => undefined }),
}));

import { initialPlan, startPlan } from "@/lib/plan-store";

test("a fresh, empty form starts with both riders on bus/train", () => {
  expect(startPlan(null).people.map((p) => p.mode)).toEqual(["transit", "transit"]);
  expect(initialPlan().people.map((p) => p.mode)).toEqual(["transit", "transit"]);
  // Unreadable saved data counts as a new form.
  expect(startPlan("{not json").people.map((p) => p.mode)).toEqual(["transit", "transit"]);
});

test("a saved plan keeps the modes that were chosen", () => {
  const saved = { ...initialPlan(), people: [
    { id: "p1", mode: "car", text: "", place: null },
    { id: "p2", mode: "walk", text: "", place: null },
    { id: "p3", mode: "car", text: "", place: null },
  ] };
  expect(startPlan(JSON.stringify(saved)).people.map((p) => p.mode)).toEqual(["car", "walk", "car"]);
});
