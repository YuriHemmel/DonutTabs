import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18next from "i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Donut, type DonutHoverTarget } from "../donut/Donut";
import { decideQuickRelease } from "../donut/quickRelease";
import { ScriptConfirmModal } from "../donut/ScriptConfirmModal";
import { ipc, CONFIG_CHANGED_EVENT, SHORTCUT_RELEASED_EVENT } from "../core/ipc";
import { initI18n, changeLanguage } from "../core/i18n";
import { applyTokensAsCssVars, watchSystemTheme } from "../core/theme";
import { resolveThemeTokens, type ThemeTokens } from "../core/themeTokens";
import { translateAppError, isAppError } from "../core/errors";
import { donutSizeForTabs } from "../donut/donutSize";
import type { Config } from "../core/types/Config";

interface ScriptPrompt {
  tabId: string;
  command: string;
  profileId: string;
  itemIndex: number;
}

function App({ initialConfig }: { initialConfig: Config | null }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<Config | null>(initialConfig);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scriptPrompt, setScriptPrompt] = useState<ScriptPrompt | null>(null);
  const [tokens, setTokens] = useState<ThemeTokens | undefined>(undefined);
  // Issue #71 — refs (não state) pra que o listener do shortcut-released
  // sempre leia os valores mais recentes sem re-bindar quando o cursor
  // se mexe ou o config troca.
  const hoverTargetRef = useRef<DonutHoverTarget>(null);
  const configRef = useRef<Config | null>(initialConfig);
  const handleSelectRef = useRef<(tabId: string) => void>(() => {});
  const handleOpenSettingsRef = useRef<() => void>(() => {});
  // Bumpa a cada re-show pra remontar o <Donut> e zerar estado local
  // (mode profile-switcher, sub-donut navigation, hover-hold). Reabrir o
  // donut sempre começa em "tabs" no root.
  const [showKey, setShowKey] = useState(0);

  useEffect(() => {
    if (config) return;
    ipc.getConfig().then(setConfig).catch(console.error);
  }, [config]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (errorMsg) {
          setErrorMsg(null);
          return;
        }
        void ipc.hideDonut();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [errorMsg]);

  useEffect(() => {
    const w = getCurrentWindow();
    const html = document.documentElement;
    // Mount inicial: dispara fade-in tão logo o webview começa a pintar.
    // requestAnimationFrame garante que a transition rode (sem rAF, o browser
    // pode coalescer a mudança de class com a primeira renderização e pular o
    // fade).
    requestAnimationFrame(() => html.classList.add("donut-visible"));
    const unlisten = w.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        // Re-show da janela (Rust faz hide em vez de close): força fade-in
        // de novo. Reset opacity sem transition, depois reaplica class no
        // próximo frame pra disparar a animação.
        html.classList.remove("donut-visible");
        requestAnimationFrame(() =>
          requestAnimationFrame(() => html.classList.add("donut-visible")),
        );
        // Bumpa a key pra remontar o <Donut> e descartar estado local
        // residual da sessão anterior (issue #13).
        setShowKey((k) => k + 1);
      } else {
        // Limpa a class antes do hide pra que o próximo show comece em
        // opacity 0 (sem isso, próxima abertura aparece sem fade).
        html.classList.remove("donut-visible");
        void ipc.hideDonut();
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<Config>(CONFIG_CHANGED_EVENT, (e) => {
      setConfig(e.payload);
      // Troca o idioma em runtime para espelhar o que a Settings aplicou;
      // strings do toast (erro de openTab) já refletem na próxima abertura.
      void changeLanguage(e.payload.appearance.language);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // Issue #71 — modo rápido: ao soltar o atalho global o backend emite
  // `shortcut-released`. Se houver tab sob o cursor, abre; senão só esconde
  // o donut. Listener registrado apenas uma vez; refs cuidam de ler valores
  // atuais.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen(SHORTCUT_RELEASED_EVENT, () => {
      const action = decideQuickRelease(
        configRef.current,
        hoverTargetRef.current,
      );
      switch (action.type) {
        case "openTab":
          handleSelectRef.current(action.tabId);
          break;
        case "openSettings":
          handleOpenSettingsRef.current();
          break;
        case "hide":
          void ipc.hideDonut();
          break;
        case "noop":
          break;
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
    // `handleSelect` é re-criado a cada render mas a referência via closure
    // sempre lê o config atual via configRef; refs estabilizam o listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Plano 15: aplica tokens visuais como CSS vars sempre que o config muda
  // — alimenta CSS para superfícies não-SVG (toast, modals). Donut SVG
  // continua consumindo via `tokens` prop + ThemeContext. Re-resolve em
  // mudança do `prefers-color-scheme` para que perfis em `theme: auto`
  // sigam o SO mesmo com o donut aberto sem trigger de config-changed.
  useEffect(() => {
    if (!config) return;
    const activeProfile = config.profiles.find(
      (p) => p.id === config.activeProfileId,
    );
    if (!activeProfile) return;
    const apply = () => {
      const next = resolveThemeTokens(
        activeProfile.theme,
        activeProfile.themeOverrides,
      );
      setTokens(next);
      applyTokensAsCssVars(next);
    };
    apply();
    return watchSystemTheme(activeProfile.theme, apply);
  }, [config]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Issue #39 — fecha donut quando click cai em área "vazia" da janela:
    //   1) Backdrop transparente em volta do SVG (target = outerDiv).
    //   2) Dead zone interna (dentro do innerR mas fora do CenterCircle
    //      pintado) e gaps angulares entre slices/rings — SVG default é
    //      `pointer-events: visiblePainted`, então click fora de path
    //      pintado tem `target = <svg>` (não captura nas slices/circles).
    // Slices/CenterCircle param o evento via seu próprio onClick (target
    // vira o path/circle/rect), então click neles não chega aqui.
    const target = e.target as Element;
    if (target === e.currentTarget || target.tagName.toLowerCase() === "svg") {
      void ipc.hideDonut();
    }
  };

  const handleHoverChange = useCallback((target: DonutHoverTarget) => {
    hoverTargetRef.current = target;
  }, []);

  const handleSelect = async (tabId: string) => {
    try {
      await ipc.openTab(tabId);
      void ipc.hideDonut();
    } catch (err) {
      // Plano 14: `script_blocked` significa que o tab tem um Script
      // untrusted no perfil ativo. Abrimos o `<ScriptConfirmModal>` em vez
      // do toast — donut continua visível para o user decidir.
      // `scripts_disabled` (kill-switch fechado) cai no toast normal.
      if (
        isAppError(err) &&
        err.kind === "launcher" &&
        err.message.code === "script_blocked"
      ) {
        const ctx = err.message.context ?? {};
        if (config) {
          setScriptPrompt({
            tabId,
            command: ctx.command ?? "",
            profileId: ctx.profileId ?? config.activeProfileId,
            itemIndex: parseInt(ctx.itemIndex ?? "0", 10) || 0,
          });
          return;
        }
      }
      setErrorMsg(translateAppError(err, t));
    }
  };

  const handleScriptConfirm = async (trustForever: boolean) => {
    if (!scriptPrompt) return;
    const prompt = scriptPrompt;
    setScriptPrompt(null);
    try {
      if (trustForever) {
        // expectedCommand blinda contra reorder/edit em outra janela entre
        // o modal abrir e o user confirmar.
        await ipc.setScriptTrusted(
          prompt.profileId,
          prompt.tabId,
          prompt.itemIndex,
          prompt.command,
          true,
        );
        // setScriptTrusted persiste; openTab agora passa pelo gating sem force.
        await ipc.openTab(prompt.tabId);
      } else {
        // One-shot: bypassa trust apenas do índice prompted. Outros scripts
        // untrusted no tab seguem bloqueando — modal reabre se for o caso.
        await ipc.openTab(prompt.tabId, prompt.itemIndex);
      }
      void ipc.hideDonut();
    } catch (err) {
      setErrorMsg(translateAppError(err, t));
    }
  };

  const handleScriptCancel = () => {
    setScriptPrompt(null);
    // Donut continua aberto — user pode tentar outra aba.
  };

  const handleOpenSettings = async (intent?: import("../core/ipc").SettingsIntent) => {
    try {
      await ipc.openSettings(intent);
      void ipc.hideDonut();
    } catch (err) {
      setErrorMsg(translateAppError(err, t));
    }
  };

  // Mantém o ref apontando para a versão atual de handleSelect; o listener
  // de SHORTCUT_RELEASED_EVENT (registrado uma única vez) lê via ref pra
  // não capturar uma closure antiga com `config`/`showOnboarding` stale.
  handleSelectRef.current = (tabId: string) => {
    void handleSelect(tabId);
  };
  handleOpenSettingsRef.current = () => {
    void handleOpenSettings();
  };

  const handleEditTab = (tabId: string) => {
    void handleOpenSettings(`edit-tab:${tabId}` as import("../core/ipc").SettingsIntent);
  };

  const handleDeleteTab = async (tabId: string, parentPath: string[]) => {
    try {
      await ipc.deleteTab(tabId, undefined, parentPath);
    } catch (err) {
      setErrorMsg(translateAppError(err, t));
    }
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "grid",
        placeItems: "center",
        background: "transparent",
      }}
      onClick={handleBackdropClick}
    >
      {config &&
        (() => {
          const activeProfile =
            config.profiles.find((p) => p.id === config.activeProfileId) ?? null;
          // Plano 23 — espelha o cálculo do backend (`donut_window::show`):
          // SVG precisa cobrir a janela inteira, senão rings externos são
          // clipados. Tabs vazias caem em `donutSizeForTabs([]) = 420`.
          const donutSize = donutSizeForTabs(activeProfile?.tabs ?? []);
          return (
            <Donut
              key={showKey}
              tabs={activeProfile?.tabs ?? []}
              size={donutSize}
              itemsPerPage={config.pagination.itemsPerPage}
              wheelDirection={config.pagination.wheelDirection}
              hoverHoldMs={config.interaction.hoverHoldMs}
              searchShortcut={config.interaction.searchShortcut}
              sliceGapEnabled={config.interaction.sliceGapEnabled}
              tokens={tokens}
              onSelect={handleSelect}
              onOpenSettings={handleOpenSettings}
              onEditTab={handleEditTab}
              onDeleteTab={handleDeleteTab}
              profiles={config.profiles}
              activeProfileId={config.activeProfileId}
              onSelectProfile={(profileId) => {
                void ipc.setActiveProfile(profileId);
              }}
              onCreateProfile={() => {
                void handleOpenSettings("new-profile");
              }}
              onHoverChange={handleHoverChange}
            />
          );
        })()}
      {errorMsg && (
        <div
          role="alert"
          style={{
            position: "fixed",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "8px 14px",
            borderRadius: 8,
            background: "#3a1f24",
            color: "#fdd",
            border: "1px solid #884",
            maxWidth: "80vw",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            style={{
              background: "transparent",
              color: "#fdd",
              border: "1px solid #884",
              borderRadius: 4,
              padding: "2px 8px",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {t("donut.toastDismiss")}
          </button>
        </div>
      )}
      {scriptPrompt && (
        <ScriptConfirmModal
          command={scriptPrompt.command}
          onConfirm={(trustForever) => {
            void handleScriptConfirm(trustForever);
          }}
          onCancel={handleScriptCancel}
        />
      )}
    </div>
  );
}

async function bootstrap() {
  let initialConfig: Config | null = null;
  let language: Config["appearance"]["language"] = "auto";
  try {
    initialConfig = await ipc.getConfig();
    language = initialConfig.appearance.language;
  } catch (e) {
    console.error("getConfig failed during i18n bootstrap; using auto", e);
  }
  await initI18n(language);

  const root = createRoot(document.getElementById("root")!);
  root.render(
    <I18nextProvider i18n={i18next}>
      <App initialConfig={initialConfig} />
    </I18nextProvider>,
  );
}

void bootstrap();
