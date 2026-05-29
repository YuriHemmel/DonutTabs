<p align="center">
  <img src="public/app-icon.png" alt="DonutTabs" width="96" height="96">
</p>

# DonutTabs

> Menu radial transparente que abre no cursor por atalho global e dispara grupos de URLs, arquivos, pastas, apps ou scripts em um clique.

[![CI](https://github.com/YuriHemmel/DonutTabs/actions/workflows/ci.yml/badge.svg)](https://github.com/YuriHemmel/DonutTabs/actions/workflows/ci.yml)

DonutTabs é um app de bandeja (tray) cross-platform (Windows, macOS, Linux) feito para eliminar a fricção das tarefas repetitivas do começo do dia: aquele combo de "abrir Gmail + calendário + Jira", "abrir 3 dashboards do Grafana", "abrir a pasta do projeto + o terminal + o VS Code". Você configura **abas** (cada aba = um conjunto de itens), aciona um atalho de teclado, e o donut aparece centralizado no cursor. Clicar numa fatia dispara tudo de uma vez.

---

## Sumário

- [Recursos](#recursos)
- [Instalação](#instalação)
  - [Avisos de antivírus / SmartScreen / Gatekeeper](#avisos-de-antivírus--smartscreen--gatekeeper)
- [Uso básico](#uso-básico)
- [Configuração](#configuração)
- [Perfis](#perfis)
- [Tipos de item suportados](#tipos-de-item-suportados)
- [Atalhos](#atalhos)
- [Atualizações automáticas](#atualizações-automáticas)
- [Desenvolvimento](#desenvolvimento)
- [Arquitetura](#arquitetura)
- [Contribuindo](#contribuindo)
- [Licença](#licença)

---

## Recursos

- **Menu radial** transparente, undecorated, sempre no topo, posicionado no cursor.
- **Atalho global** configurável (padrão `Ctrl+Shift+Space` / `Cmd+Shift+Space`).
- **Abas e grupos** — agrupe abas em sub-donuts (até 2 níveis de profundidade).
- **Itens heterogêneos** por aba — URLs, arquivos, pastas, apps instalados, scripts shell.
- **Perfis múltiplos** — cada perfil tem suas próprias abas, atalho, tema e regras (ex.: "Trabalho", "Pessoal", "Estudo").
- **Temas customizáveis** por perfil (cores, raios, transparência) + presets dark/light/auto.
- **Busca rápida** por aba (overlay com `Ctrl+F` por padrão, configurável).
- **Picker visual de apps** instalados (cross-OS) para não digitar caminhos.
- **Histórico de scripts** com captura de stdout/stderr (opt-out).
- **Import/export** da configuração inteira em JSON.
- **Autostart** opcional (LaunchAgent no macOS, Task Scheduler no Windows).
- **i18n** pt-BR e en, com detecção automática.
- **Auto-update** via GitHub Releases com notificação OS-native.

---

## Instalação

Baixe o instalador da sua plataforma na página de [Releases](https://github.com/YuriHemmel/DonutTabs/releases/latest):

| Plataforma | Arquivo |
| --- | --- |
| Windows | `DonutTabs_<versão>_x64-setup.exe` ou `.msi` |
| macOS (Apple Silicon) | `DonutTabs_<versão>_aarch64.dmg` |
| macOS (Intel) | `DonutTabs_<versão>_x64.dmg` |
| Linux (Debian/Ubuntu) | `donut-tabs_<versão>_amd64.deb` |
| Linux (universal) | `donut-tabs_<versão>_amd64.AppImage` |

Após instalar, o app sobe direto na bandeja do sistema — **não há janela principal**. Use o atalho ou o menu do tray para começar.

### Avisos de antivírus / SmartScreen / Gatekeeper

Como o DonutTabs é um app jovem e ainda não passou por **code-signing comercial** (cert OV/EV no Windows ou notarização Apple no macOS), é normal que o sistema operacional ou o seu antivírus mostrem um aviso na primeira execução. **Isso não significa que o binário seja malicioso** — é o comportamento padrão para qualquer instalador novo sem reputação acumulada.

Os bundles oficiais são compilados pelo workflow `release.yml` deste repositório a partir do código-fonte público; cada release publica também os checksums para conferência.

#### Windows — SmartScreen "Windows protegeu seu PC"

1. Clique em **Mais informações** no aviso.
2. Clique em **Executar assim mesmo**.
3. O Defender pode pedir confirmação adicional uma única vez; aprove.

Se o seu antivírus de terceiros (Kaspersky, Avast, Bitdefender, ESET, etc.) bloquear o `.exe`/`.msi`:

- Confira o **SHA256** do arquivo baixado contra o publicado na página do Release.
- Restaure o arquivo da quarentena e adicione a pasta de instalação à lista de exclusões, ou
- Reporte como **falso positivo** no formulário do fornecedor — geralmente liberam em 24–72h após análise.

#### macOS — Gatekeeper "DonutTabs não pode ser aberto"

Se você baixou o `.dmg` e o macOS recusa abrir:

```bash
# Remove o atributo de quarentena que o Safari/Chrome adiciona em downloads
xattr -d com.apple.quarantine /Applications/DonutTabs.app
```

Ou, sem usar o terminal:

1. No Finder, **botão direito** (ou Ctrl+clique) em **DonutTabs.app** → **Abrir**.
2. No diálogo, clique em **Abrir** novamente.
3. Em seguida, aprove em **Ajustes do Sistema → Privacidade e Segurança** se ainda for solicitado.

A partir da próxima execução o sistema lembra a decisão.

#### Linux

`.AppImage` e `.deb` não disparam alertas equivalentes. Se o `.AppImage` não executar, garanta a flag de execução:

```bash
chmod +x DonutTabs_*.AppImage
./DonutTabs_*.AppImage
```

#### Verificando integridade

Cada release publica um arquivo `latest.json` com a assinatura Ed25519 do bundle (usada pelo updater automático). Para validar manualmente o download, compare o **SHA256** do arquivo:

```bash
# macOS / Linux
shasum -a 256 DonutTabs_*.dmg

# Windows (PowerShell)
Get-FileHash .\DonutTabs_*-setup.exe -Algorithm SHA256
```

contra o checksum exibido na página do Release.

---

## Uso básico

1. **Abra o donut** com o atalho global (padrão `Ctrl+Shift+Space` no Windows/Linux, `Cmd+Shift+Space` no macOS) ou via tray → **Abrir donut**.
2. **Clique numa fatia** para abrir todos os itens daquela aba.
3. **Hover-hold** em uma fatia (segurar o mouse parado em cima) revela os botões de **editar** (✏️) e **excluir** (🗑️).
4. **Botão direito** em uma fatia abre um menu de contexto com "Abrir tudo / Editar / Excluir".
5. **Rolar a roda do mouse** pagina entre páginas quando há muitas abas.
6. **Metade esquerda do centro** (⚙) abre o **Settings**; **metade direita** (👤) abre o switcher de perfis.
7. **ESC** fecha o donut; em sub-donut, ESC volta um nível.
8. **`Ctrl+F`** (configurável) abre a busca rápida de abas dentro do donut.

---

## Configuração

A configuração mora num único arquivo JSON, criado automaticamente no primeiro start:

| SO | Caminho |
| --- | --- |
| Windows | `%APPDATA%\DonutTabs\config.json` |
| macOS | `~/Library/Application Support/DonutTabs/config.json` |
| Linux | `~/.config/DonutTabs/config.json` |

Edite **pelo Settings** (tray → **Configurações** ou ⚙ no donut). Mexer no JSON na mão funciona, mas perde validações da UI e a janela só recarrega após reabrir o app.

O Settings oferece:

- **Abas**: CRUD, drag-and-drop para reordenar, picker de ícone (emoji ou ícones Lucide), picker de arquivo/pasta nativo, picker visual de apps instalados.
- **Aparência**: tema (dark/light/auto), idioma, customização fina de cores e raios por perfil, toggle de autostart, toggle global do permissão de scripts no perfil, atualizações automáticas.
- **Atalho**: gravador interativo — pressione a combinação desejada.
- **Histórico**: log de execuções de script com stdout/stderr (quando habilitado).

### Import / export

Em **Settings → Aparência → Sistema** há botões para **exportar** o JSON inteiro (incluindo todos os perfis) e **importar** um arquivo de outra máquina. A importação valida tudo antes de substituir; falhas mantêm a configuração atual intacta.

---

## Perfis

Cada perfil é um conjunto independente de:

- **Nome + ícone**
- **Atalho global** (apenas o do perfil ativo está registrado no SO)
- **Tema e overrides cosméticos**
- **Abas**
- **Flag `allowScripts`** — kill-switch que bloqueia execução de qualquer script no perfil, independente da flag `trusted` per-item

Use perfis para separar contextos (ex.: "Trabalho" com Jira/Gmail/Slack, "Pessoal" com YouTube/Notícias). Trocar de perfil é instantâneo via switcher no centro do donut ou via Settings.

---

## Tipos de item suportados

Cada aba carrega uma lista ordenada de itens; clicar na aba dispara todos em sequência.

| Tipo | Comportamento | Campos |
| --- | --- | --- |
| **URL** | Abre no navegador padrão (ou no handler em `openWith`, ex.: `firefox`) | `value`, `openWith?` |
| **Arquivo** | Abre no app padrão do SO ou em `openWith` (ex.: `code` pra forçar VS Code) | `path`, `openWith?` |
| **Pasta** | Abre no explorador de arquivos ou em `openWith` | `path`, `openWith?` |
| **App** | Lança o executável por nome (com picker visual cross-OS) | `name` |
| **Script** | Roda um comando shell (`cmd /C` no Windows, `sh -c` em Unix) | `command`, `trusted` |

**Segurança de scripts:** scripts não confiáveis disparam um modal de confirmação na primeira execução, com a opção "Confiar nesta aba" para pular o modal nas próximas. O kill-switch `allowScripts` por perfil tem prioridade absoluta — quando desligado, **nenhum** script roda no perfil, independente da flag `trusted`.

---

## Atalhos

| Atalho | Ação |
| --- | --- |
| `Ctrl/Cmd+Shift+Space` | Abre o donut no cursor (configurável por perfil) |
| `Ctrl/Cmd+F` | Busca rápida de abas dentro do donut (configurável globalmente) |
| `ESC` | Fecha o donut (ou volta um nível em sub-donut) |
| Clique fora / Alt-Tab | Fecha o donut |
| Roda do mouse | Pagina entre páginas de abas |

---

## Atualizações automáticas

O app checa por updates na inicialização (quando online). Quando uma nova versão estiver disponível:

- Aparece uma **notificação OS-native** uma única vez por versão.
- O ícone do tray ganha uma entrada **📥 Atualizar para v…**.
- Em **Settings → Aparência → Sistema → Atualizações** há um card com release notes e botão **Instalar e reiniciar**.

Para desligar, desmarque **Verificar atualizações automaticamente** na mesma seção. O botão **Verificar agora** ignora os gates e força a checagem.

Pipeline de release documentado em [`docs/release-process.md`](docs/release-process.md).

---

## Desenvolvimento

### Stack

- **Tauri 2** (Rust core) — janelas, atalho global, tray, IO, IPC
- **React 19 + TypeScript** — donut SVG e Settings
- **Vite** — bundling do frontend
- **ts-rs** — geração automática de tipos TS a partir de structs Rust

### Pré-requisitos

- **Node.js** ≥ 20
- **Rust** stable + Cargo (instale via [rustup](https://rustup.rs))
- **Dependências nativas do Tauri** — siga o [guia oficial](https://v2.tauri.app/start/prerequisites/) para o seu SO:
  - **Windows**: WebView2 (já vem no Windows 11) + Build Tools do Visual Studio
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `webkit2gtk-4.1`, `libssl-dev`, `libgtk-3-dev`, `librsvg2-dev`, etc.

### Setup

```bash
git clone https://github.com/YuriHemmel/DonutTabs.git
cd DonutTabs
npm install
```

### Comandos

```bash
# Dev loop com hot-reload do frontend e auto-rebuild do Rust
npm run tauri dev

# Frontend
npm test                 # vitest run (todos os testes do frontend)
npx tsc --noEmit         # typecheck sem emitir

# Rust (cd src-tauri primeiro)
cargo test --lib         # todos os testes Rust
cargo clippy --lib       # lint (rodamos com -D warnings no CI)
cargo fmt --check        # check de formato; sem --check aplica

# Build de produção (instaladores para o SO atual)
npm run tauri build
```

### Regenerando bindings ts-rs

`src/core/types/*.ts` é **gerado** a partir das structs Rust com `#[derive(TS)]` via `cargo test`. Os arquivos **são versionados** e o CI valida drift:

```bash
cd src-tauri && cargo test --lib config::schema   # regenera src/core/types/
cd .. && git add src/core/types/
```

### Estrutura

```
src-tauri/src/        # Rust core
  config/             # schema v2, migrações v1→v2, validação, IO atômico
  commands.rs         # comandos Tauri expostos para o frontend
  donut_window/       # criação da janela transparente
  settings_window/    # criação da janela do Settings
  tray/               # ícone e menu da bandeja
  shortcut/           # registro de atalho global
  launcher/           # abertura de URLs/arquivos/apps/scripts
  favicon/            # cache de favicons em disco
  apps_picker/        # enumeração de apps instalados cross-OS
  updater/            # wrapper do tauri-plugin-updater
  script_history/     # captura de stdout/stderr de scripts
  errors.rs           # AppError tagged enum com códigos i18n-friendly

src/                  # Frontend
  donut/              # SVG do donut + hooks de gesto
  settings/           # janela de configuração
  core/               # i18n, IPC, tema, tipos gerados
  entry/              # entrypoints React (donut.tsx, settings.tsx)
  locales/            # pt-BR.json, en.json
```

A regra de ouro: **Rust nunca desenha UI; frontend nunca toca disco ou APIs do SO**. Toda nova necessidade de acesso ao sistema vira um `#[tauri::command]` em `src-tauri/src/commands.rs` exposto via `src/core/ipc.ts`.

Documentação detalhada por módulo em [`CLAUDE.md`](CLAUDE.md).

---

## Arquitetura

Processo único com três peças lógicas:

1. **Rust core** — toda preocupação OS-level (atalho global, tray, criação de janelas, abertura de URLs, IO de config).
2. **Webview do donut** — janela transparente no cursor que renderiza o SVG do donut e captura hover/click.
3. **Webview do Settings** — janela decorada e redimensionável para CRUD de abas, perfis e preferências.

As duas webviews se comunicam com o Rust via **comandos Tauri tipados**. Mudanças no config disparam um evento `config-changed` que ambas as janelas escutam, mantendo o estado sincronizado sem polling.

Diagramas e racional de design no [`docs/Plano.md`](docs/Plano.md) (local, gitignored).

---

## Contribuindo

PRs são bem-vindos. Convenções principais:

- **TDD para lógica pura** (`config/*`, `launcher`, `geometry`, validadores) — teste falha primeiro, depois o mínimo código pra passar.
- **Schema-first** — qualquer novo dado trocado entre Rust e frontend nasce como struct Rust com `#[derive(TS)]`.
- **Atomic writes para config** — sempre via `config::io::save_atomic` (validate → `.tmp` → rename) com rollback em memória se a escrita falhar.
- **Strings de UI passam por `t()`** — sem texto hardcoded em JSX ou em payload de `AppError`. Toda nova chave precisa estar em `src/locales/pt-BR.json` e `src/locales/en.json`.
- **Commits pequenos e escopados**: `feat(config): ...`, `fix(launcher): ...`, `docs(plan): ...`. Um logical concern = um commit.
- **CI verde antes do merge** — 5 jobs paralelos (frontend, lint, test-linux, test-macos, test-windows). Clippy roda com `-D warnings`.

Para mudanças não-triviais, abra uma issue primeiro descrevendo o problema. Para bugs, anexe o `config.json` (sanitizado de URLs sensíveis) e o SO.

---

## Licença

A definir. O código-fonte está público enquanto a licença não é formalizada; entre em contato antes de redistribuir comercialmente.

---

## Créditos

Construído com [Tauri](https://tauri.app), [React](https://react.dev), [Vite](https://vitejs.dev) e [Lucide Icons](https://lucide.dev).
