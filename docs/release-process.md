# DonutTabs — Processo de Release (Plano 18)

Este documento descreve o pipeline ponta-a-ponta para publicar uma nova versão e fazer com que apps já instalados na máquina dos usuários recebam o aviso de atualização (via `tauri-plugin-updater`).

## Visão geral

- **Trigger:** push de uma tag `v*` (ex.: `v0.2.0`) na origem.
- **Workflow:** `.github/workflows/release.yml` roda matrix Win/macOS/Linux usando `tauri-apps/tauri-action@v0`.
- **Saída:** GitHub Release com bundles assinados (`.msi`/`.exe`, `.dmg`/`.app.tar.gz`, `.deb`/`.AppImage`) + `latest.json` (manifest do updater).
- **Distribuição:** apps instalados consultam o endpoint configurado em `tauri.conf.json` (`plugins.updater.endpoints`) na inicialização e exibem notificação OS-native quando detectam versão maior.

## Setup inicial (uma única vez)

### 1. Gerar o keypair de assinatura

A primeira vez que for publicar releases é preciso gerar um par de chaves Ed25519. A **chave pública** vai versionada em `tauri.conf.json`; a **chave privada** vai como secret do GitHub.

```bash
# Instala o CLI do Tauri se ainda não tem
npm install --save-dev @tauri-apps/cli

# Gera o keypair (substitua o caminho)
npx tauri signer generate -w ~/.tauri/donuttabs.key
```

O comando pede uma senha. Anote — ela será o secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. O comando produz dois arquivos:

- `~/.tauri/donuttabs.key` — chave **privada** (NÃO commitar, NÃO compartilhar).
- `~/.tauri/donuttabs.key.pub` — chave **pública** (vai pro `tauri.conf.json`).

### 2. Configurar `tauri.conf.json`

Substitua o placeholder em `src-tauri/tauri.conf.json`:

```jsonc
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/YuriHemmel/DonutTabs/releases/latest/download/latest.json"
    ],
    "pubkey": "<conteúdo de ~/.tauri/donuttabs.key.pub>",
    "windows": { "installMode": "passive" }
  }
}
```

**Atenção:** essa pubkey é embarcada nos binários compilados a partir desse commit. Se a chave for trocada depois, **apps com versão antiga rejeitam updates assinados pela nova chave** — o usuário precisaria reinstalar manualmente. Trate a pubkey como decisão para a vida do projeto.

### 3. Configurar secrets no GitHub

No repositório, em **Settings → Secrets and variables → Actions**, criar:

- `TAURI_SIGNING_PRIVATE_KEY` — conteúdo do arquivo `~/.tauri/donuttabs.key` (cole o texto inteiro).
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — a senha definida ao gerar a chave.

### 4. (Opcional) Code-signing dos binários

Os bundles assinados pelo Tauri verificam apenas o **updater** (signature do manifest). O sistema operacional, porém, pode bloquear a primeira execução do `.exe`/`.dmg` baixado:

- **Windows**: SmartScreen mostra warning até o `.exe` ser code-signed com cert OV/EV (~$200–$400/ano). Para distribuição interna, pular é aceitável; usuários veem "Mais informações → Executar mesmo assim".
- **macOS**: Gatekeeper exige notarização ($99/ano Apple Developer). Sem isso, o `.dmg` mostra "DonutTabs is damaged" no primeiro launch — usuário precisa right-click → Open.
- **Linux**: nenhum equivalente; `.AppImage` e `.deb` rodam direto.

V1 do Plano 18 deixa esses requisitos como **operacionais** — o workflow não automatiza certs. Quando contratar, configure as variáveis adicionais que `tauri-action` documenta (`APPLE_CERTIFICATE`, `WINDOWS_CERTIFICATE`, etc.).

## Publicar uma nova versão

### 1. Bumpar a versão em três arquivos

Manter sincronizado:

- `src-tauri/tauri.conf.json` → `"version": "0.2.0"`
- `src-tauri/Cargo.toml` → `version = "0.2.0"`
- `package.json` → `"version": "0.2.0"`

### 2. Commitar a versão

```bash
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json
git commit -m "chore(release): v0.2.0"
git push origin main
```

### 3. Criar tag anotada com release notes

A action puxa o conteúdo da tag annotation e injeta como `releaseBody` do GitHub Release **e** como `notes` do `latest.json`. Isso significa que essas notas vão aparecer:

- na página do GitHub Release;
- no `<details>` "Notas da versão" do `<UpdateCard>` no Settings dos apps instalados.

```bash
git tag -a v0.2.0 -m "$(cat <<'EOF'
DonutTabs v0.2.0

- feat(...): descrição curta voltada pro user
- fix(...): bug corrigido (ex.: tray entry sumindo no segundo startup)
- ...
EOF
)"
git push origin v0.2.0
```

> **Importante:** use `git tag -a` (annotated). Tags lightweight (`git tag v0.2.0` sem `-a`) não têm corpo, e o workflow cai no fallback `"Release v0.2.0"` — release sai sem notes pro user.

A tag dispara `release.yml`. A action faz tudo:

- Build matrix nas 3 plataformas (~10–20min).
- Assina os bundles com a chave privada.
- Cria GitHub Release `v0.2.0`.
- Faz upload dos bundles + `latest.json` apontando pra eles.

### 4. Verificar o Release

- Em **Releases → v0.2.0**, conferir que aparecem assets para os 3 OSes + `latest.json`.
- Abrir `https://github.com/YuriHemmel/DonutTabs/releases/latest/download/latest.json` no browser; deve retornar JSON com `version`, `notes`, `pub_date`, `platforms.{darwin-x86_64,...}.{signature, url}`.

### 5. Validar no app instalado

Abrir uma máquina rodando a versão anterior (ex.: `v0.1.0`):

- Em até alguns segundos depois do startup, deve aparecer notification OS-native "DonutTabs: atualização disponível".
- O ícone do tray ganha entrada **📥 Atualizar para v0.2.0**.
- Em **Configurações → Aparência → Sistema → Atualizações**, o card mostra "Versão 0.2.0 disponível" + botão "Instalar e reiniciar".

Se nada disso aparece, conferir:

- Endpoint URL retornando 200 e JSON válido.
- `pubkey` em `tauri.conf.json` matching com a chave que assinou os bundles.
- App rodando com `system.autoCheckUpdates: true` no config (default).
- Conexão com a internet (offline silencia o check).

## Troubleshooting

### "Signature mismatch" ao instalar update

Significa que o bundle baixado foi assinado com chave diferente da `pubkey` embarcada. Possibilidades:

- Pubkey no `tauri.conf.json` foi trocada entre builds.
- Secret `TAURI_SIGNING_PRIVATE_KEY` no GitHub foi trocado mas a pubkey não foi atualizada no commit.
- Bundle adulterado em trânsito (raro).

Solução: confirme que a pubkey no commit do release-tag bate com a chave pública correspondente à privada nos secrets.

### `latest.json` retorna 404

Workflow não terminou ou falhou. Conferir aba **Actions** do repo. Comum em primeiros runs:

- Faltam dependências nativas no Linux (já cobertas em `release.yml`, mas se a versão do `webkit2gtk` mudar, ajustar `apt-get install`).
- macOS sem Apple Dev Cert: build passa, signing local falha. Para v1 do projeto, build sem certs ainda gera bundles válidos para signature do updater (Tauri usa Ed25519 separado de code-signing OS).

### App não mostra notification mesmo com nova versão

- Conferir `system.autoCheckUpdates` no config da máquina-alvo (`%APPDATA%\DonutTabs\config.json` no Windows; `~/Library/Application Support/DonutTabs/config.json` no macOS; `~/.config/DonutTabs/config.json` no Linux). Se está `false`, ligue.
- Conferir `system.lastNotifiedUpdateVersion` — se já está com a versão remota, isso significa que o usuário já foi notificado para esta versão. Apague o campo (ou deixe avançar pra próxima versão).
- Botão **Verificar agora** no Settings ignora ambos os gates e dispara o fluxo manualmente — útil para validar se o problema é gate ou plugin.

### Build local quebra com `pubkey` placeholder

Após o setup inicial, a chave pública precisa ser real. O placeholder `TODO_PUBKEY_PLACEHOLDER` faz o plugin falhar ao verificar updates em runtime, mas **build** funciona. Para dev local sem chave real:

- `cargo build --lib` continua passando.
- `npm run tauri build` compila o bundle, mas o updater rejeita a verificação se você apontar para um manifest assinado por outra chave.
- Para dev sem updater, deixe o placeholder; em release real, substitua pela chave gerada.

## Rollout

Não há rollout escalonado nativo. O `latest.json` é único; assim que publicado, qualquer app que checar a partir dali vê a versão nova. Em projetos pequenos é aceitável; quando user base crescer, considerar:

- Hospedar `latest.json` em CDN com lógica de split (ex.: 10% dos users).
- Manter um endpoint `beta` separado em `plugins.updater.endpoints[1]`.

Por enquanto, **uma tag = um release = todo mundo vê**.
