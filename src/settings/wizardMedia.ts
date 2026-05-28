// Vite resolve esses imports pra URLs finais (com hash em build de produção)
// e inclui os arquivos no bundle automaticamente. Trocar o asset = trocar o
// import.
import demoCreateTab from "../assets/wizard/demoCreateTab.webp";
import demoSubdonuts from "../assets/wizard/demoSubdonuts.mp4";
import demoGroupInDonut from "../assets/wizard/demoGroupInDonut.webp";
import demoProfileSwitch from "../assets/wizard/demoProfileSwitch.webp";
import demoSearchOverlay from "../assets/wizard/demoSearchOverlay.webp";
import demoQuickMode from "../assets/wizard/demoQuickMode.mp4";
import demoSpawnPositionCursor from "../assets/wizard/demoSpawnPosition.webp";
import demoSpawnPositionCenter from "../assets/wizard/demoSpawnPosition2.mp4";

export interface WizardMediaEntry {
  primary: string;
  /** Segunda mídia opcional — ex.: spawnPosition mostra cursor + central
   *  lado-a-lado. */
  secondary?: string;
}

/** Mídia ilustrativa por demo step. Steps sem entry caem no placeholder
 *  textual. Mantido em TS (não no locale JSON) porque os assets são
 *  idiomas-agnósticos hoje; se algum dia precisarmos de GIF por idioma,
 *  movemos pra `wizard.steps.<id>.media` no locale. */
export const WIZARD_MEDIA: Record<string, WizardMediaEntry> = {
  demoCreateTab: { primary: demoCreateTab },
  demoSubdonuts: { primary: demoSubdonuts },
  demoGroupInDonut: { primary: demoGroupInDonut },
  demoProfileSwitch: { primary: demoProfileSwitch },
  demoSearchOverlay: { primary: demoSearchOverlay },
  demoQuickMode: { primary: demoQuickMode },
  demoSpawnPosition: {
    primary: demoSpawnPositionCursor,
    secondary: demoSpawnPositionCenter,
  },
};

/** Retorna `true` se a URL termina em uma extensão de vídeo conhecida.
 *  Vite gera URLs com hash (ex.: `demoQuickMode-abc123.mp4`), então
 *  basta o sufixo bater. */
export function isVideoSrc(src: string): boolean {
  return /\.(mp4|webm|mov)(\?.*)?$/i.test(src);
}
