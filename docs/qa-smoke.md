# Smoke manual — Plano 1

Rodar este checklist antes de considerar o Plano 1 concluído. Repetir em cada SO.

## Pré-requisitos
1. Copiar `docs/fixtures/config.example.json` para o caminho de config do SO:
   - Linux: `~/.config/DonutTabs/config.json`
   - macOS: `~/Library/Application Support/DonutTabs/config.json`
   - Windows: `%APPDATA%\DonutTabs\config.json`

## Casos

- [ ] **Inicialização**: `npm run tauri dev` não abre janela visível. Ícone do DonutTabs aparece no tray do SO.
- [ ] **Atalho global**: `Ctrl+Shift+Space` (ou `Cmd+Shift+Space` no macOS) abre o donut no cursor.
- [ ] **Render**: donut mostra 3 fatias com ícones (💻, 📰, 🎵) e 2 com labels (Dev, Notícias).
- [ ] **Hover**: passar o mouse sobre uma fatia destaca-a visualmente.
- [ ] **Click na aba "Dev"**: navegador padrão abre github.com e stackoverflow.com. Donut fecha.
- [ ] **Atalho novamente**: abre donut de novo, desta vez mais rápido (janela pré-aquecida).
- [ ] **ESC**: com donut aberto, ESC fecha sem abrir nada.
- [ ] **Clique fora do donut** (área transparente): fecha sem abrir nada.
- [ ] **Alt-Tab** com donut aberto: donut fecha ao perder foco.
- [ ] **Tray → Abrir donut**: abre donut (no cursor atual).
- [ ] **Tray → Sair**: app encerra limpamente. Atalho global deixa de responder.

## Checks específicos por SO

- [ ] **Windows**: janela do donut é transparente (sem fundo visível), apenas o SVG renderiza.
- [ ] **macOS**: mesmo; confirma que `macOSPrivateApi: true` está funcionando.
- [ ] **Linux (X11)**: transparência funciona com compositor (KWin, Mutter, Picom, etc.).
- [ ] **Linux (Wayland)**: verificar que atalho global é registrado (alguns DEs bloqueiam — reportar se falhar).
