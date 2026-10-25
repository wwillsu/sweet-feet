import { useColorScheme } from "react-native";

/** Same palette as dashboard/src/styles.css (light + dark), so phone and web match. */
const light = {
  page: "#f9f9f7",
  surface1: "#fcfcfb",
  surface2: "#f0efec",
  textPrimary: "#0b0b0b",
  textSecondary: "#52514e",
  textMuted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  border: "rgba(11, 11, 11, 0.1)",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"],
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
  accent: "#2a78d6",
  footFill: "#f0efec",
  footStroke: "#c3c2b7",
  zoneWarning: "rgba(250, 178, 25, 0.12)",
  zoneAlert: "rgba(208, 59, 59, 0.10)",
};

const dark: typeof light = {
  ...light,
  page: "#0d0d0d",
  surface1: "#1a1a19",
  surface2: "#262624",
  textPrimary: "#f0efec",
  textSecondary: "#c3c2b7",
  grid: "#2c2c2a",
  axis: "#383835",
  border: "rgba(255, 255, 255, 0.1)",
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"],
  accent: "#3987e5",
  footFill: "#262624",
  footStroke: "#4a4a46",
  zoneWarning: "rgba(250, 178, 25, 0.14)",
  zoneAlert: "rgba(208, 59, 59, 0.16)",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
