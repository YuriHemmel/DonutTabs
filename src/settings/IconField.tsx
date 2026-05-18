import React from "react";
import { useTranslation } from "react-i18next";
import { IconDisplay } from "./IconDisplay";
import { stripLetters } from "./textUtils";

const LUCIDE_PREFIX = "lucide:";
const isLucideToken = (s: string) => s.startsWith(LUCIDE_PREFIX);

export interface IconFieldProps {
  /** Token corrente — `lucide:Name`, emoji literal, ou string vazia. */
  value: string;
  /** Recebe o token transformado pronto pra salvar. Para input livre,
   *  `stripLetters` é aplicado internamente (mesma lógica que TabEditor /
   *  ProfileEditor faziam antes). Para Lucide chip, propaga `""` no clear. */
  onChange: (next: string) => void;
  /** Abre o `<IconPicker>`. Mantido externo pra que a mesma instância de
   *  picker possa servir name + icon (pickerOpen state do caller). */
  onRequestPicker: () => void;
  placeholder?: string;
  /** Base test-id; sufixos `-input`, `-chip`, `-clear` aplicados nas partes. */
  testId?: string;
  maxLength?: number;
}

const baseFieldStyle: React.CSSProperties = {
  background: "var(--input-bg)",
  color: "var(--fg)",
  border: "1px solid var(--input-border)",
  borderRadius: 4,
  font: "inherit",
  boxSizing: "border-box",
  height: 40,
};
/** Width do input quando vazio. Estreito o bastante pra um único emoji
 *  caber confortavelmente — não precisa acomodar texto longo. */
const INPUT_WIDTH = 90;
/** Width do chip quando preenchido. Ícone (28px) + clear button + paddings. */
const CHIP_WIDTH = 80;
/** Tamanho do ícone dentro do chip (Lucide SVG ou emoji). */
const CHIP_ICON_SIZE = 28;

/**
 * Campo unificado pra ícone. Quando `value` está preenchido (Lucide token,
 * emoji ou qualquer literal), renderiza um chip mostrando o ícone resolvido
 * (clique = reabrir picker) + botão "×" pra limpar. Quando vazio, renderiza
 * um `<input>` pra digitar emoji. Após o usuário digitar um emoji o campo
 * alterna pra chip — consistência com o caminho Lucide.
 *
 * `stripLetters` aplicado em texto livre evita que o usuário digite
 * "lucide:Heart" manualmente como texto-bruto (o picker é o caminho canônico
 * pra Lucide).
 */
export const IconField: React.FC<IconFieldProps> = ({
  value,
  onChange,
  onRequestPicker,
  placeholder,
  testId,
  maxLength = 64,
}) => {
  const { t } = useTranslation();

  if (value.length > 0) {
    return (
      <div
        data-testid={testId ? `${testId}-chip` : undefined}
        style={{
          ...baseFieldStyle,
          width: CHIP_WIDTH,
          display: "inline-flex",
          alignItems: "center",
          padding: "0 4px 0 6px",
          gap: 4,
        }}
      >
        <button
          type="button"
          data-testid={testId ? `${testId}-chip-icon` : undefined}
          onClick={onRequestPicker}
          title={t("settings.icon.changeChip")}
          aria-label={t("settings.icon.changeChip")}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--fg)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 2,
            flex: 1,
          }}
        >
          <IconDisplay icon={value} fallback="?" size={CHIP_ICON_SIZE} />
        </button>
        <button
          type="button"
          data-testid={testId ? `${testId}-chip-clear` : undefined}
          onClick={() => onChange("")}
          title={t("settings.icon.clear")}
          aria-label={t("settings.icon.clear")}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--muted)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: "2px 4px",
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <input
      data-testid={testId}
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(isLucideToken(raw) ? raw : stripLetters(raw));
      }}
      placeholder={placeholder}
      maxLength={maxLength}
      size={2}
      style={{
        ...baseFieldStyle,
        width: INPUT_WIDTH,
        padding: "6px 8px",
        textAlign: "center",
        fontSize: 20,
      }}
    />
  );
};
