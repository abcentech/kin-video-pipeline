/**
 * Every December composition takes `{ day }` (plus `index` for shorts) and loads the compiled plan
 * from the public dir in calculateMetadata, so one bundle renders any day.
 * Owner: the lead.
 */
import { staticFile, type CalculateMetadataFunction } from "remotion";
import { FPS, type Plan, type PromoPlan } from "./types";

export type DayProps = { day: number; plan?: Plan };
export type ShortProps = DayProps & { index: number };

export const dayDir = (day: number) => `day${String(day).padStart(2, "0")}`;
/** staticFile path of something inside the day folder */
export const dayFile = (day: number, rel: string) => staticFile(`${dayDir(day)}/${rel}`);

export const fetchPlan = async (day: number): Promise<Plan> => {
  const res = await fetch(dayFile(day, "plan.json"));
  if (!res.ok) throw new Error(`December: no plan for day ${day} (${res.status}) — run scripts/december/plan.mjs ${day}`);
  return (await res.json()) as Plan;
};

/** calculateMetadata for a piece: `pick` returns the piece's length in frames. */
export const withPlan =
  <T extends DayProps>(pick: (plan: Plan, props: T) => number, size: { width: number; height: number }): CalculateMetadataFunction<T> =>
  async ({ props }) => {
    const plan = props.plan ?? (await fetchPlan(props.day));
    return { fps: FPS, durationInFrames: Math.max(1, Math.round(pick(plan, props))), ...size, props: { ...props, plan } };
  };

export const promoOf = (plan: Plan, id: string, format: "16x9" | "9x16"): PromoPlan => {
  if (id === "trailer") return plan.trailer[format];
  const s = plan.shorts.find((p) => p.id === id);
  if (!s) throw new Error(`December: day ${plan.meta.day} has no short "${id}"`);
  return s;
};
