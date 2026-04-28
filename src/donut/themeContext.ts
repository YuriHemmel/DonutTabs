import React from "react";
import { resolvePresetTokens, type ThemeTokens } from "../core/themeTokens";

/**
 * Tokens visuais correntes do donut (preset + overrides já fundidos).
 * O provider é montado no `<Donut>` para que `<Slice>`, `<CenterCircle>`,
 * `<HoverHoldOverlay>`, etc. consumam sem prop drilling. Default = preset
 * dark, usado quando nenhum provider está montado (ex: testes pontuais).
 */
export const ThemeContext = React.createContext<ThemeTokens>(
  resolvePresetTokens("dark"),
);

export function useTheme(): ThemeTokens {
  return React.useContext(ThemeContext);
}
