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

## Plano 19 — output capture pra scripts

> Pré-requisito: criar uma aba com `Item::Script { command, trusted: true }` e `Profile.allowScripts: true`. Comandos de teste: `echo hello`, `echo err 1>&2`, `sleep 30`, `seq 15000` (gera 15K linhas).

- [ ] **Captura básica**: aba com `echo "hello"; echo "err" 1>&2` → executar via donut → abrir Settings → Histórico. Run aparece com `status === "succeeded"`, `exitCode === 0`, stdout contendo "hello\n", stderr contendo "err\n".
- [ ] **Live streaming**: aba com `for i in 1 2 3; do echo $i; sleep 1; done` → executar → enquanto roda, abrir detail no Histórico → ver linhas aparecendo incrementalmente (não só no fim).
- [ ] **Cancel mid-run**: aba com `sleep 30` → executar → abrir detail → ver `status === "running"` e botão "Cancelar execução" visível → clicar Cancel → status vira "Cancelado", child morto (verificar via `ps`/Task Manager).
- [ ] **Cap de 10K linhas**: aba com `seq 15000` → executar → run termina com `truncated: true`, banner "Output truncado" visível, stdout tem ~10K linhas (não 15K).
- [ ] **Cap de 1MB**: aba com `dd if=/dev/zero bs=1M count=2 2>/dev/null | base64` (2MB de output em uma única "linha" base64) → run termina com `truncated: true`, stdout < 1MB.
- [ ] **Bounded queue de 50 runs**: executar 51 scripts seguidos (`seq 1 51 | xargs -I{} echo {}` em loop manual) → lista no Histórico mostra exatamente 50 entradas; a 1ª executada (mais antiga) sumiu.
- [ ] **Toggle off `scriptHistoryEnabled`**: Settings → Aparência → Sistema → desmarcar "Capturar output de scripts" → executar uma aba script → Histórico continua mostrando entradas anteriores mas a nova execução **não** aparece (volta ao fire-and-forget Plano-14).
- [ ] **Limpar tudo**: clicar "Limpar tudo" → confirma → lista esvaza; runs em curso continuam vivas mas saída futura é descartada (run não está mais no buffer).
- [ ] **Configs Plano-18 e anteriores** carregam com `scriptHistoryEnabled: true` (default).
- [ ] **Output buffer não persiste em disco**: grep por `scriptHistory` em `config.json` deve ser zero. Reabrir o app → Histórico volta vazio.
- [ ] **Per-stream isolation**: aba com `echo out; echo err 1>&2; echo out2` → stdout tem "out\nout2\n", stderr tem "err\n".
- [ ] **Copy button**: clicar "Copiar" no detail → clipboard contém comando + stdout + stderr formatados.
- [ ] **Cross-OS**: smoke nos 3 SOs (Windows usa `cmd /C`, Unix usa `sh -c`).

## Plano 18 — auto-updater

> Pré-requisito do smoke: keypair gerado via `tauri signer generate` e pubkey copiada pra `tauri.conf.json` (placeholder `TODO_PUBKEY_PLACEHOLDER` falha na verificação de signature). Ver [docs/release-process.md](release-process.md).

- [ ] Build local: `npm run tauri build` em cada SO completa sem erro com plugin updater + notification habilitados.
- [ ] **Startup notification**: instalar v0.1.0; bumpar versão pra 0.1.1, build, hospedar manifest `latest.json` localmente (file:// ou endpoint dev) apontando pra v0.1.1; reabrir v0.1.0 → notification OS-native dispara uma única vez ("DonutTabs: atualização disponível"). Reabrir o app de novo → notification **não** dispara (gate `lastNotifiedUpdateVersion`).
- [ ] **Reset do gate**: bumpar pra 0.1.2 (nova versão remota) → reabrir → notification dispara de novo.
- [ ] **Tray menu dinâmico**: com update pendente, item "📥 Atualizar para v0.1.1" aparece antes de "Sair"; click abre Settings.
- [ ] **Settings → Aparência → Sistema → Atualizações**: card mostra "Versão 0.1.1 disponível" com release notes (se houver) + botão "Instalar e reiniciar". Toggle "Verificar atualizações automaticamente" persiste através de reinício.
- [ ] **Botão "Verificar agora"**: ignora gate de notification — clica em estado "upToDate", depois publicar nova versão remota e clicar de novo → mostra "Versão X disponível" sem precisar reiniciar.
- [ ] **Install flow**: clicar "Instalar e reiniciar" → barra "Baixando… X%" → instalação automática → app reinicia com versão nova. Reabrir app pós-update → Settings mostra "Versão atual: vX.Y.Z" e "Você está na versão mais recente."
- [ ] **Toggle off `autoCheckUpdates`**: reabrir app → startup task **não** dispara check (verificar via log: nenhuma chamada de `updater::check`); botão "Verificar agora" no Settings continua funcionando.
- [ ] **Erros**: simular offline → "Verificar agora" → banner "Sem conexão para verificar atualizações." (`updater_network_unavailable`). Apontar endpoint pra signature errada → banner "Assinatura da atualização inválida." Endpoint 404 → banner "Falha ao verificar atualizações: …".
- [ ] **Configs Plano-17 e anteriores** carregam com defaults: `autoCheckUpdates = true`, `lastNotifiedUpdateVersion` ausente do JSON; nenhuma migração explícita necessária.
- [ ] **Workflow GitHub Actions** (com secrets `TAURI_SIGNING_PRIVATE_KEY` + password configurados): `git tag v0.X.Y && git push origin v0.X.Y` dispara `release.yml`; build matrix completa nos 3 SOs; Release público criado com bundles + `latest.json` validamente assinado.

## Plano 17 — picker visual de apps

- [ ] Settings → Adicionar aba → kind = App → row mostra botão "📋 Procurar app".
- [ ] Click no botão abre `<AppPicker>` modal; **Windows**: lista contém apps comuns (Firefox, Edge, Chrome, etc.) detectados via App Paths registry + Start Menu.
- [ ] **macOS**: lista contém apps de `/Applications` (ex.: Safari, Finder, etc.) — verificar nome do bundle sem `.app`.
- [ ] **Linux**: lista contém apps com `.desktop` em `/usr/share/applications` (ex.: Firefox, GNOME Terminal). Apps com `NoDisplay=true` não aparecem.
- [ ] Filtro por substring funciona em `name` E `path` (digitar "fox" filtra Firefox; digitar fragmento de path também filtra).
- [ ] Teclado: ↑/↓ navega highlight, Enter seleciona, Esc fecha sem mudança.
- [ ] Click numa row preenche `value` do draft no Settings; salvar a aba e testar via donut: app abre.
- [ ] Botão "Atualizar lista" re-fetch detecta apps recém-instalados (smoke: instalar app durante a sessão e clicar refresh).
- [ ] Configs antigas (sem dependência do picker) carregam normal — picker é só assistência de digitação, não muda schema.

## Plano 16 — sub-donuts

- [ ] Criar grupo vazio: Settings → Adicionar aba → radio "Grupo (sub-donut)" → name+icon → Save. Grupo aparece em TabList com ▶ e "0 abas".
- [ ] **Round-trip do grupo vazio**: reabrir o grupo recém-criado → TabEditor mostra "Conteúdo do grupo" (não o ItemListEditor) → Save sem mudanças mantém kind=group.
- [ ] Editar grupo: clicar no row do grupo → TabEditor mostra "Conteúdo do grupo" vazio + botão "+ Adicionar aba".
- [ ] Adicionar aba dentro do grupo: clica "+ Adicionar aba" → TabEditor entra em mode new com path correto → Save → reabrir o grupo, child aparece na lista.
- [ ] Donut drill-in: atalho global → click em group slice → sub-donut aparece com children + breadcrumb no topo ("Início / NomeDoGrupo").
- [ ] **Drillar em group vazio**: atalho global → click em grupo sem children → sub-donut com apenas o "+ slice" aparece (drillagem permitida porque `kind === "group"`).
- [ ] Donut breadcrumb: click em "Início" volta ao root sem reload; click em segmento intermediário trunca o path.
- [ ] ESC em sub-donut volta um nível; ESC no root fecha o donut.
- [ ] CenterCircle metade direita em sub-donut: vira ↩ "voltar" (não abre profile switcher).
- [ ] "+ slice" em sub-donut abre Settings em mode new com parentPath correto (verificar via Save → child aparece dentro do grupo).
- [ ] Hover-hold delete em group: confirm modal com contagem ("Excluir grupo X? N sub-itens serão removidos") → confirmar → grupo + descendentes somem; cancelar → tudo intacto.
- [ ] **Context-menu delete em group**: right-click em group slice → "Excluir" → confirm modal com **mesma** mensagem cascade ("Excluir grupo X? N sub-itens…"), não a genérica.
- [ ] Profundidade 3 é o limite: criar root group → child group → tentar criar sub-sub-group → "+ Adicionar subgrupo" some no editor com hint "Profundidade máxima atingida".
- [ ] Backward-compat: copiar config Plano-15 (sem `kind` nem `children`) → app abre normal, todas tabs viram leaves automaticamente.
- [ ] Reorder dentro de grupo via DnD em Settings: arrastar child A pra cima de child B reordena só esse nível.

## Plano 15 — temas customizáveis

- [ ] Settings → Aparência → "Personalizar tema" mostra 5 color pickers + 3 sliders + preview.
- [ ] Mudar `Cor da fatia` no color picker reflete imediatamente no `<MiniDonutPreview>` ao lado.
- [ ] Salvar (auto via IPC após cada mudança): atalho global → reabrir donut → cores refletidas.
- [ ] Trocar perfil ativo via tray ou switcher: donut redesenha com cores do novo perfil sem reload.
- [ ] Botão ↺ ao lado do campo zera só aquele override; "Restaurar padrão" zera todos (volta ao preset).
- [ ] Slider de raio interno em 0.40 + raio externo em 0.30 → erro `theme_radius_inverted` no save (preview pode quebrar visualmente; backend rejeita).

## Checks específicos por SO

- [ ] **Windows**: janela do donut é transparente (sem fundo visível), apenas o SVG renderiza.
- [ ] **macOS**: mesmo; confirma que `macOSPrivateApi: true` está funcionando.
- [ ] **Linux (X11)**: transparência funciona com compositor (KWin, Mutter, Picom, etc.).
- [ ] **Linux (Wayland)**: verificar que atalho global é registrado (alguns DEs bloqueiam — reportar se falhar).
