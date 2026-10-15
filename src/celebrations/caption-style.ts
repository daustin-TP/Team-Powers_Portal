export const fonts = {
  sans: { name: "Clean sans", family: "Arial, Helvetica, sans-serif" },
  serif: { name: "Classic serif", family: "Georgia, Times New Roman, serif" },
  impact: { name: "Bold headline", family: "Impact, Arial Black, sans-serif" },
  mono: { name: "Typewriter", family: "Courier New, monospace" },
  rounded: { name: "Friendly", family: "Trebuchet MS, Arial, sans-serif" },
};
export type CaptionStyle = {
  font: keyof typeof fonts;
  size: number;
  x: number;
  y: number;
  width: number;
  color: string;
  background: boolean;
  align: "left" | "center" | "right";
};
export const defaultStyle: CaptionStyle = {
  font: "sans",
  size: 3.5,
  x: 8,
  y: 70,
  width: 84,
  color: "#ffffff",
  background: true,
  align: "center",
};
export function validateStyle(value: unknown): CaptionStyle | null {
  if (!value || typeof value !== "object") return null;
  const v = value as CaptionStyle;
  if (
    !Object.hasOwn(fonts, v.font) ||
    !["left", "center", "right"].includes(v.align) ||
    typeof v.background !== "boolean" ||
    !/^#[0-9a-f]{6}$/i.test(v.color)
  )
    return null;
  if (
    ![v.size, v.x, v.y, v.width].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    )
  )
    return null;
  if (
    v.size < 1.5 ||
    v.size > 7 ||
    v.width < 25 ||
    v.width > 95 ||
    v.x < 0 ||
    v.x + v.width > 100.01 ||
    v.y < 0 ||
    v.y > 85
  )
    return null;
  return {
    font: v.font,
    size: v.size,
    x: v.x,
    y: v.y,
    width: v.width,
    color: v.color,
    background: v.background,
    align: v.align,
  };
}
export function readStyle(json?: string | null): CaptionStyle {
  try {
    return validateStyle(JSON.parse(json || "")) || defaultStyle;
  } catch {
    return defaultStyle;
  }
}
