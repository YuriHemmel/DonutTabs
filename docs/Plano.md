# DonutTabs — Plano e Design

**Versão**: v0.1 (MVP)
**Data**: 2026-04-23
**Stack escolhida**: Tauri 2 + TypeScript/React (frontend) + Rust (núcleo)

---

## 1. Visão do produto

DonutTabs é um aplicativo desktop cross-platform (Windows, Linux, macOS) que acelera a tarefa repetitiva de abrir conjuntos de links/recursos do dia a dia. O usuário pressiona um atalho global, um menu radial (donut) aparece no cursor, seleciona uma aba, e o app abre todos os links associados àquela aba.

O objetivo do MVP é entregar este fluxo principal de forma sólida, leve e previsível. Evoluções futuras (perfis, arquivos, aplicativos, scripts) estão desenhadas na arquitetura mas fora do escopo inicial.

### 1.1. Público

Qualquer usuário de computador com rotinas repetitivas de abertura de múltiplas páginas (trabalho, estudo, pesquisa, fluxos operacionais). Cross-platform é requisito — o app precisa funcionar igualmente nos três sistemas.

### 1.2. Princípios de design

- **Leveza**: app sempre em tray, baixo consumo de RAM e CPU em idle.
- **Velocidade**: da pressão do atalho à tela renderizada, latência sub-100ms após o primeiro uso.
- **Previsibilidade**: comportamentos consistentes; nenhum dado perdido em silêncio.
- **Escalabilidade incremental**: cada fase é independentemente entregável. O MVP é útil por si só; features futuras enriquecem mas não são pré-requisito.
- **Isolamento claro**: núcleo (Rust) cuida do sistema; UI (React) cuida de renderização e input. Fronteiras explícitas e testáveis.

---

## 2. Arquitetura geral

O app roda em um único processo Tauri com três partes lógicas:

### 2.1. Núcleo (Rust)

Tudo que toca o sistema operacional:

- Registrar/desregistrar atalho global (plugin `global-shortcut`)
- Gerenciar ícone do tray (plugin `tray`)
- Criar/mostrar/esconder janelas (donut e configurações)
- Abrir URLs no navegador padrão (plugin `opener`)
- Ler/escrever o arquivo de configuração
- Gerenciar auto-start no SO (plugin `autostart`)

### 2.2. UI do donut (webview, TS/React)

Janela transparente, sem bordas, sempre-no-topo, efêmera. Aparece no cursor (ou centro, conforme config), renderiza o donut em SVG, captura hover/clique/roda do mouse, delega a ação ao núcleo.

### 2.3. UI de configurações (webview, TS/React)

Janela normal, com bordas. CRUD de abas, configuração de atalho, tema, posição de spawn, modo de seleção, paginação, auto-start.

### 2.4. Por que separar em duas janelas

A janela do donut é transparente/sem bordas/sempre-no-topo; a de configurações é janela normal. As duas compartilham o mesmo projeto frontend (mesmo bundle TS/React, rotas/entrypoints diferentes), mas precisam de configurações de janela distintas no Tauri.

### 2.5. Comunicação

Frontend → Núcleo: comandos Tauri tipados (via `invoke()`).
Núcleo → Frontend: eventos Tauri (`config-changed`, `theme-changed`, etc.).
Tipos TypeScript são gerados a partir do Rust via `ts-rs` para evitar divergência de schema.

---

## 3. Componentes internos

### 3.1. Núcleo Rust (`src-tauri/src/`)

| Módulo | Responsabilidade |
|---|---|
| `config/` | Ler, escrever, validar e migrar o arquivo de configuração. Único módulo que toca disco para config. |
| `shortcut/` | Registra e desregistra o atalho global. Expõe comando `set_shortcut`. |
| `tray/` | Menu do tray (Abrir donut / Configurações / Sair) e handlers de clique. |
| `donut_window/` | Cria, mostra e esconde a janela do donut. Posiciona no cursor ou centro. |
| `settings_window/` | Cria, mostra e foca a janela de configurações. |
| `launcher/` | Recebe lista de items e delega ao plugin `opener`. Base para expansão a files/apps/scripts. |
| `autostart/` | Wrapper fino em cima do plugin `autostart`. |
| `events/` | Define eventos tipados emitidos do Rust para o frontend. |
| `main.rs` | Setup, registro de comandos, amarração dos módulos. |

### 3.2. Frontend TS/React (`src/`)

| Módulo | Responsabilidade |
|---|---|
| `donut/` | Componente `<Donut/>` (SVG), `<Slice/>`, `<CenterCircle/>`, `<PlusSlice/>`; hook `useSliceHighlight` (coordenadas polares → fatia). |
| `settings/` | `<SettingsApp/>`, `<TabList/>`, `<TabEditor/>`, `<ShortcutRecorder/>`, `<AppearanceSection/>`. |
| `core/ipc.ts` | Camada fina sobre `invoke()`. Ponto único para mockar/trocar. |
| `core/types.ts` | Tipos espelhando o schema do Rust (gerados por `ts-rs`). |
| `core/theme.ts` | Resolve tema atual (dark/light/auto) e expõe via contexto React. |
| `entry/donut.tsx` | Entrypoint da janela do donut. |
| `entry/settings.tsx` | Entrypoint da janela de configurações. |

### 3.3. Regra de fronteira

- Rust nunca desenha UI.
- Frontend nunca toca disco nem chama API de SO.
- Toda integração de sistema passa por comandos Tauri.

---

## 4. Modelo de dados

### 4.1. Localização do arquivo

| SO | Caminho |
|---|---|
| Windows | `%APPDATA%\DonutTabs\config.json` |
| macOS | `~/Library/Application Support/DonutTabs/config.json` |
| Linux | `~/.config/DonutTabs/config.json` |

Resolvido via `app_config_dir()` do Tauri — sem hardcode.

### 4.2. Schema (versão 1 — MVP)

```jsonc
{
  "version": 1,

  "shortcut": "Ctrl+Shift+Space",

  "appearance": {
    "theme": "dark",                    // "dark" | "light" | "auto" (padrão: "dark")
    "language": "auto"                  // "pt-BR" | "en" | "auto" (padrão: "auto" — usa navigator.language, fallback "en")
  },

  "interaction": {
    "spawnPosition": "cursor",          // "cursor" | "center"
    "selectionMode": "clickOrRelease",  // "clickOrRelease" | "hoverRelease" | "clickOnly"
    "hoverHoldMs": 800                  // tempo para acionar modo editar/excluir na fatia
  },

  "pagination": {
    "itemsPerPage": 6,                  // faixa válida: 4–8
    "wheelDirection": "standard"        // "standard" | "inverted"
  },

  "system": {
    "autostart": false
  },

  "tabs": [
    {
      "id": "a7f3...",                  // UUID v4
      "name": "Trabalho",               // opcional (string | null)
      "icon": "💼",                     // opcional (string | null)
      "order": 0,
      "openMode": "reuseOrNewWindow",   // "reuseOrNewWindow" | "newWindow" | "newTab"
      "items": [
        { "kind": "url", "value": "https://github.com/..." },
        { "kind": "url", "value": "https://mail.google.com" }
      ]
    }
  ]
}
```

### 4.3. Regras de validação

- Pelo menos um de `name` ou `icon` deve existir em cada aba (ambos opcionais, mas não ao mesmo tempo).
- `shortcut` deve ser uma combinação válida aceita pelo plugin `global-shortcut`.
- `items[].value` para `kind: "url"` deve ser uma URL parseável.
- `itemsPerPage` ∈ [4, 8].
- `id` único; duplicatas detectadas no boot são resolvidas regenerando IDs pela ordem mais antiga.

### 4.4. Decisões de formato

- **Items como objetos discriminados por `kind`**: ponto-chave da extensibilidade. Itens `file`/`app`/`script`/`folder` entram em fases futuras sem quebrar o schema. No MVP, o parser aceita apenas `kind: "url"` e ignora outros com log.
- **`version` no topo**: habilita migrações versionadas quando o schema mudar (ex: v1 → v2 adiciona `profiles`).
- **`id` como UUID**: referências futuras (histórico, atalhos específicos) continuam válidas mesmo após renomear aba.
- **Write atômica**: grava em `config.json.tmp` e faz `rename`. Evita corrupção se o processo morrer durante a escrita.
- **Sem criptografia**: arquivo é legível e editável manualmente — feature, não bug.

### 4.5. Espaço reservado para fases futuras

- `appearance.language` ativo a partir da Fase 2 (i18n — "auto" | "pt-BR" | "en", com espaço para mais idiomas). Campo já reservado no schema do MVP, porém ignorado até a Fase 2.
- `profiles[]` (perfis — Fase 2)
- `appearance` ganhando acentos, transparência, customização por perfil (Fase 4)
- `items[].kind` aceitando `"file"`, `"app"`, `"folder"`, `"script"` (Fase 3)
- `items[].openMode` por item, não só por aba (Fase 3)

---

## 5. Fluxos principais

### 5.1. Fluxo A — Abrir donut e selecionar aba

1. Usuário pressiona atalho global. Plugin `global-shortcut` dispara callback no Rust.
2. `donut_window` mostra a janela (cria na primeira vez, depois reaproveita a oculta) no cursor.
3. Janela carrega `donut.tsx` com config injetada no estado inicial — sem roundtrip IPC.
4. Donut renderiza em SVG. `useSliceHighlight` converte posição do cursor em fatia destacada.
5. Roda do mouse → muda página (evento local, sem IPC).
6. Clique (ou soltar do atalho, conforme modo) → `invoke("open_tab", { tabId })`.
7. Rust lê `items` da aba e chama o plugin `opener` para cada URL.
8. Frontend chama `invoke("hide_donut")` e a janela some.

### 5.2. Fluxo B — Abrir configurações

1. Clique na metade esquerda do círculo central (engrenagem) → `invoke("open_settings")`.
2. Rust cria/foca a `settings_window`. Donut fecha.
3. Settings carrega, busca config via `invoke("get_config")`.

### 5.3. Fluxo C — Criar/editar/excluir aba

**Criar ou editar pelo Settings:**
1. Usuário clica em "Adicionar aba" (ou seleciona uma existente) → abre `<TabEditor>`.
2. Preenche nome e/ou ícone, lista de URLs, modo de abertura.
3. Salvar → `invoke("save_tab", { tab })`.
4. Rust valida, atualiza memória, escreve atomicamente em disco, emite `config-changed`.
5. Frontends escutam e recarregam.

**Editar/excluir via hover sustentado no donut (atalho gestual):**
1. Hover sustentado na fatia por ~800ms → preenchimento radial anima do centro à borda externa.
2. Sair do hover antes de completar → preenchimento reverte suavemente (sem ação).
3. Completar preenchimento → overlay dividido verticalmente: ✏️ esquerda, 🗑️ direita.
4. Clique/soltar atalho na metade esquerda → fecha donut e abre Settings no `<TabEditor>` daquela aba (`invoke("open_settings", { editTabId })`).
5. Clique/soltar atalho na metade direita → expande metade em "Confirmar? Sim/Não" inline. Sim → `invoke("delete_tab", { id })`. Não → volta ao estado anterior.
6. Ressalva de modo: no modo `hoverRelease`, o preenchimento exige 800ms, maior que o tempo típico de uma seleção normal. Soltar antes executa a aba; soltar depois entra em modo ação.

### 5.4. Fluxo D — Alterar atalho global

1. Settings → "Gravar atalho" (`<ShortcutRecorder>`).
2. Captura próxima combinação no frontend → `invoke("set_shortcut", { combo })`.
3. Rust tenta registrar o novo. Se falhar (em uso), devolve erro, o antigo permanece ativo, frontend mostra mensagem.
4. Se sucesso, desregistra antigo, persiste em disco, emite `config-changed`.

### 5.5. Fluxo E — Dismiss do donut sem seleção

- ESC → se o donut está em "modo ação" (pós hover-hold mostrando editar/excluir), ESC volta ao estado normal do donut (cancela a ação, preserva o donut aberto). Caso contrário, `invoke("hide_donut")`.
- Clique fora da área do donut → `invoke("hide_donut")`
- Perder foco da janela (alt-tab, outro app ganha foco) → `invoke("hide_donut")`
- Janela é **escondida**, não destruída, nas primeiras N invocações — abertura instantânea nas próximas. Após inatividade longa (ex: 5min), a janela é destruída para liberar memória; próxima invocação recria.

### 5.6. Regras de layout

- **"+" é sempre a última fatia da última página.** Se a última página está cheia de abas normais, uma nova página é criada contendo apenas "+".
- **Paginação**: 6 fatias por página (padrão), configurável 4–8. Indicadores visuais (pontos clicáveis) na parte inferior do donut, estilo carrossel.
- **Ao excluir uma aba**: abas restantes são reordenadas de forma compacta (sem slots vazios). "+" permanece no final da última página.
- **Transição entre páginas**: animação sutil de slide/rotação leve para o usuário perceber a mudança.

### 5.7. Cache de dados

- **Núcleo**: config vive em memória como `Arc<RwLock<Config>>`. Disco é camada de persistência. Escritas em disco são assíncronas após atualização da memória.
- **Donut**: config é injetada no estado inicial da janela, não buscada via `invoke()` após carregar. Elimina latência IPC na abertura.
- **Eventos**: frontend escuta `config-changed` para sincronizar quando Settings atualiza algo com o donut também aberto.
- **Pré-carregamento**: após o primeiro uso, a janela do donut é mantida oculta (não destruída). Invocações subsequentes são apenas `show_at(cursor)`. Latência alvo sub-100ms.

---

## 6. Tratamento de erros

### 6.1. Erros de sistema

- **Atalho global não registrável** (em uso por outro app): `set_shortcut` retorna erro tipado. Toast: "Atalho em uso por outro aplicativo — tente outro." Atalho antigo permanece ativo.
- **Falha ao abrir URL**: núcleo acumula erros por aba. Se 3 de 5 URLs abriram, toast não-bloqueante: "2 de 5 links não puderam ser abertos." Clicar no toast abre detalhes. URLs válidas continuam abrindo.
- **Falha ao criar janela do donut** (raro — problema de compositor/GPU): loga e mostra notificação no tray.

### 6.2. Erros de configuração

- **JSON corrompido / inválido no boot**: Rust renomeia para `config.json.corrupt-YYYYMMDD-HHMMSS`, cria config padrão, notifica no tray com caminho do backup. Nunca perde silenciosamente.
- **Config parseável mas com valores inválidos** (atalho inválido, URL malformada): validação aceita o que é válido, rejeita o resto com log, expõe via `get_config_issues` para o Settings exibir banner "N itens foram desabilitados por erro".
- **Erro de escrita em disco** (permissão, disco cheio): `save_tab` retorna erro ao frontend. Formulário permanece aberto com mensagem. Memória não é atualizada se a persistência falhou.

### 6.3. Erros do frontend

- `<ErrorBoundary>` global por janela mostra tela mínima "Algo deu errado — recarregar" com botão que reinicia a janela. Núcleo não afetado.
- Tipos gerados por `ts-rs` tornam comandos/tipos incompatíveis em erro de compilação, não runtime.

### 6.4. Integridade

- **Write atômica**: `config.json.tmp` → `rename`. Nunca arquivo meio-escrito.
- **IDs duplicados**: bloqueados no save. No boot, se encontrar duplicatas por corrupção, regenera IDs preservando a aba mais antiga pela ordem.

### 6.5. Logs

Arquivo rotativo em `app_log_dir()` do Tauri. Níveis: INFO (eventos normais), WARN (itens ignorados), ERROR (falhas). Logs nunca incluem URLs completas por padrão (apenas domínios) — pode ser habilitado em modo debug.

### 6.6. Fora de escopo

Telemetria e relatórios de crash automáticos não entram no MVP. Se necessário depois, entram com opt-in explícito.

### 6.7. Mensagens de erro e i18n (Fase 2+)

No MVP, mensagens de erro dentro de `AppError` são strings livres em português. A partir da **Fase 2** (quando o i18n entra), `AppError` evolui para variantes com **código estruturado + contexto** em vez de mensagem pronta. Exemplo:

- MVP: `AppError::Config("itemsPerPage deve estar entre 4 e 8 (got 99)")`
- Fase 2+: `AppError::Config { code: "items_per_page_out_of_range", context: { got: 99 } }`

O frontend recebe o código e usa a chave de tradução correspondente (`errors.config.itemsPerPageOutOfRange`) com interpolação de `context`. Isso desacopla texto de lógica e evita strings hardcoded no núcleo Rust.

Logs internos (arquivo) continuam em inglês técnico — independentes da localização da UI do usuário.

### 6.7. Princípio geral

Nunca perder dados do usuário em silêncio. Nunca travar o fluxo principal por erro em borda. Sempre deixar rastro (log + notificação).

---

## 7. Estratégia de testes

### 7.1. Núcleo Rust — unitários (`cargo test`)

- `config/`: rodada `Config → JSON → Config`, validação completa (URLs, atalhos, IDs duplicados, nome+ícone vazios), migrações (v0 → v1), write atômica (simular crash e verificar sobrevivência), recovery de corrupção.
- `launcher/`: mock de `Opener` via trait; verificar chamadas, acumulador de erros, continuação após falha individual.
- Módulos dependentes de SO (`shortcut`, `tray`, `donut_window`, `autostart`): testados por integração, não unitários.

### 7.2. Frontend TS/React — componente (Vitest + React Testing Library)

- `core/ipc.ts` mockado em todos os testes.
- `<Donut>`: renderização correta de fatias, "+" na posição certa, paginação via roda do mouse mockada.
- `useSliceHighlight`: tabela de coordenadas polares → fatia esperada.
- Hover-hold: máquina de estados (idle → filling → action → confirm) com `vi.useFakeTimers()`.
- `<TabEditor>`: validações (rejeita nome+ícone vazios; aceita só ícone; aceita só nome; rejeita URL malformada).
- `<ShortcutRecorder>`: captura de combinações, rejeição de teclas reservadas (Enter, Tab, Esc).

### 7.3. Integração — subset pragmático

- **`tauri::test` em Rust**: subir app de teste em memória, invocar comandos, verificar eventos. Cobre `get_config`/`save_tab`/`delete_tab` end-to-end com disco real em `tempdir`.
- **Smoke E2E manual**: checklist em `docs/qa-smoke.md` rodado antes de releases — instalação, atalho global, abrir donut, selecionar aba, hover-hold editar, hover-hold excluir, mudar tema, alterar atalho, fechar/reabrir.

### 7.4. Fora do MVP

WebDriver/E2E automatizado (`tauri-driver`). Viável mas custoso em CI. Adiciona-se depois se necessário.

### 7.5. CI (fase posterior do MVP)

- Rust: `cargo test` + `cargo clippy` + `cargo fmt --check`
- Frontend: `vitest run` + `tsc --noEmit` + `eslint`
- Build de release nos três SOs via matrix (GitHub Actions ou similar)

### 7.6. Princípio

Testar **comportamento** na fronteira, não implementação. Cada módulo tem contrato claro; testes verificam o contrato, não o interior. Permite refatorar sem reescrever testes.

---

## 8. Roadmap faseado

### 8.1. MVP (v0.1) — caminho principal funciona bem

- Cross-platform: Windows, Linux, macOS
- App em tray, atalho global configurável (padrão `Ctrl+Shift+Space`)
- Donut no cursor (ou centro, configurável)
- Abas dinâmicas com "+" na última fatia da última página
- Paginação (6 padrão, 4–8 configurável) via roda do mouse + indicador de página
- Seleção híbrida (hover + clique) com opções `clickOnly` e `hoverRelease` em config
- Hover-hold → editar/excluir com preenchimento radial
- Abas: nome e/ou ícone, lista de URLs, modo de abertura configurável
- Abertura via handler padrão do SO
- Janela de configurações: CRUD completo + todas as preferências
- Tema escuro padrão, claro com tonalidade azul, auto (detecta SO)
- Persistência JSON com write atômica e recovery de corrupção
- Tratamento de erros conforme Seção 6
- Testes conforme Seção 7
- Lado direito do círculo central: reservado/desabilitado visualmente

### 8.2. Fase 2 (v0.2) — qualidade de vida

- **i18n (primeira sub-task da fase, antes da UI de Settings)**: `react-i18next` no frontend, arquivos JSON em `src/locales/{pt-BR,en}.json`, seletor de idioma no Settings, detecção automática via `navigator.language` com fallback para `en`. `AppError` do Rust evolui para códigos estruturados + contexto (ver Seção 6.7) em vez de strings livres. Toda string nova da UI do Settings já nasce traduzível. Arquitetura acomoda novos idiomas (es, etc.) apenas adicionando o JSON.
- **Janela de configurações (Settings)** com todos os componentes previstos no design: `<TabList>`, `<TabEditor>`, `<ShortcutRecorder>`, `<AppearanceSection>`. Comandos Rust `save_tab`, `delete_tab`, `set_shortcut` com write atômica. Evento `config-changed` sincronizando as duas janelas. Fatia "+" no donut abrindo Settings no modo "nova aba".
- **Perfis** (múltiplos usuários / contextos no mesmo computador) no lado direito do círculo central: clicar entra em "modo perfil" — as fatias externas viram sub-fatias dos perfis disponíveis, com uma fatia "+" para criar novo perfil (leva ao Settings). Hover + clique troca o perfil ativo e o donut volta ao modo normal com as abas do perfil selecionado. Mesma linguagem visual do donut principal.
- Cada perfil tem: suas próprias abas, atalho e tema.
- Menu de contexto (clique direito) nas abas como caminho alternativo para editar/excluir.
- Ícones além de emoji: suporte a Lucide ou favicon da primeira URL da aba.
- Drag-and-drop no Settings para reordenar abas; possibilidade de fixar aba em posição específica.

### 8.3. Fase 3 (v0.3) — expansão de items

- `kind: "file"` — arquivos locais
- `kind: "app"` — aplicativos
- `kind: "folder"` — pastas no explorador
- `kind: "script"` — comandos shell/scripts com confirmação de segurança
- `openMode` por item (não só por aba): navegador específico por URL

### 8.4. Fase 4 (v0.4+) — polimento e avançado

- Temas totalmente customizáveis (cores, transparência, tamanhos); tema por perfil
- Import/export de configuração (sincronização manual entre máquinas)
- Sub-donuts / paginação hierárquica
- Busca rápida por aba
- Auto-atualização (updater do Tauri)
- WebDriver/E2E automatizado, telemetria opt-in

### 8.5. Princípio do faseamento

Cada fase é independentemente entregável. Se qualquer fase futura nunca for implementada, o MVP continua sendo um app útil por si só.

---

## 9. Glossário

- **Donut**: o menu radial principal (abas ao redor + círculo central).
- **Fatia / slice**: cada setor do donut, representando uma aba ou o "+".
- **Aba (tab)**: entidade configurável que agrupa múltiplos items (URLs no MVP) sob um nome/ícone.
- **Item**: cada unidade que uma aba executa ao ser selecionada (URL no MVP; file/app/script/folder em fases futuras).
- **Perfil** (Fase 2): conjunto independente de abas + preferências, para contextos ou usuários diferentes no mesmo computador.
- **Hover-hold**: gesto de manter o cursor parado sobre uma fatia por N milissegundos para acionar edição/exclusão.
- **Modo de seleção**: como o usuário confirma a escolha de uma aba — `clickOrRelease` (híbrido padrão), `hoverRelease` (soltar atalho seleciona), `clickOnly`.
