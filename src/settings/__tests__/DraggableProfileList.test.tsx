import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, createEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { DraggableProfileList } from "../DraggableProfileList";
import type { Profile } from "../../core/types/Profile";

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: "p1",
  name: "Padrão",
  icon: null,
  shortcut: "Ctrl+Space",
  theme: "dark",
  tabs: [],
  ...overrides,
});

async function renderList(
  overrides: Partial<{
    profiles: Profile[];
    selectedId: string;
    activeId: string;
    onSelect: (id: string) => void;
    onReorder: (ids: string[]) => void;
  }> = {},
) {
  const i18n = await createI18n("pt-BR");
  const props = {
    profiles: [profile()],
    selectedId: "p1",
    activeId: "p1",
    onSelect: vi.fn(),
    onReorder: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <DraggableProfileList {...props} />
    </I18nextProvider>,
  );
  return { ...utils, props };
}

const mockRect = (
  el: HTMLElement,
  rect: { top?: number; height?: number; left?: number; width?: number } = {},
) => {
  const top = rect.top ?? 0;
  const height = rect.height ?? 0;
  const left = rect.left ?? 0;
  const width = rect.width ?? 0;
  el.getBoundingClientRect = () =>
    ({
      top,
      height,
      left,
      right: left + width,
      bottom: top + height,
      width,
      x: left,
      y: top,
      toJSON: () => "",
    }) as DOMRect;
};

/**
 * jsdom's `DragEvent` ignora `clientX` / `clientY` no `EventInit`. Construímos
 * via `createEvent` + `defineProperty` para garantir que o handler veja as
 * coordenadas. Sem isso `e.clientX` chega como `undefined`, e a comparação
 * com o midpoint vira `NaN < n === false`, mascarando bugs do limiar.
 */
const fireDrag = (
  el: HTMLElement,
  type: "dragOver" | "drop",
  coords: { clientX?: number; clientY?: number } = {},
) => {
  const event = createEvent[type](el);
  if (coords.clientX !== undefined) {
    Object.defineProperty(event, "clientX", { value: coords.clientX });
  }
  if (coords.clientY !== undefined) {
    Object.defineProperty(event, "clientY", { value: coords.clientY });
  }
  fireEvent(el, event);
};

describe("DraggableProfileList", () => {
  it("renders one chip per profile", async () => {
    await renderList({
      profiles: [
        profile({ id: "p1", name: "Padrão" }),
        profile({ id: "p2", name: "Estudo" }),
      ],
    });
    expect(screen.getByTestId("profile-chip-p1")).toBeTruthy();
    expect(screen.getByTestId("profile-chip-p2")).toBeTruthy();
  });

  it("clicking a chip calls onSelect", async () => {
    const user = userEvent.setup();
    const { props } = await renderList({
      profiles: [
        profile({ id: "p1" }),
        profile({ id: "p2", name: "Estudo" }),
      ],
      selectedId: "p1",
    });
    await user.click(screen.getByTestId("profile-chip-p2"));
    expect(props.onSelect).toHaveBeenCalledWith("p2");
  });

  it("Enter/Space on a focused chip selects it (keyboard accessibility)", async () => {
    const user = userEvent.setup();
    const { props } = await renderList({
      profiles: [
        profile({ id: "p1" }),
        profile({ id: "p2", name: "Estudo" }),
      ],
      selectedId: "p1",
    });
    const chip = screen.getByTestId("profile-chip-p2");
    chip.focus();
    await user.keyboard("{Enter}");
    expect(props.onSelect).toHaveBeenCalledWith("p2");
  });

  it("active profile shows the gold marker", async () => {
    await renderList({
      profiles: [
        profile({ id: "p1" }),
        profile({ id: "p2", name: "Estudo" }),
      ],
      activeId: "p2",
    });
    expect(screen.getByTestId("profile-chip-active-p2")).toBeTruthy();
    expect(screen.queryByTestId("profile-chip-active-p1")).toBeNull();
  });

  it("dragging chip p1 over the right half of chip p2 emits onReorder([p2, p1])", async () => {
    // Layout horizontal: limiar é o centro X do alvo, não Y. Esse teste
    // garante a regressão do bug em que o eixo Y decidia o lado em chips
    // dispostos lado a lado.
    const { props } = await renderList({
      profiles: [
        profile({ id: "p1", name: "Padrão" }),
        profile({ id: "p2", name: "Estudo" }),
      ],
    });
    const chip1 = screen.getByTestId("profile-chip-p1");
    const chip2 = screen.getByTestId("profile-chip-p2");
    mockRect(chip2, { left: 30, width: 20 });

    fireEvent.dragStart(chip1);
    fireDrag(chip2, "dragOver", { clientX: 48 });
    fireDrag(chip2, "drop", { clientX: 48 });

    expect(props.onReorder).toHaveBeenCalledTimes(1);
    expect(props.onReorder).toHaveBeenCalledWith(["p2", "p1"]);
  });

  it("dragging chip p2 over the left half of chip p1 emits onReorder([p2, p1])", async () => {
    const { props } = await renderList({
      profiles: [
        profile({ id: "p1", name: "Padrão" }),
        profile({ id: "p2", name: "Estudo" }),
      ],
    });
    const chip1 = screen.getByTestId("profile-chip-p1");
    const chip2 = screen.getByTestId("profile-chip-p2");
    mockRect(chip1, { left: 0, width: 20 });

    fireEvent.dragStart(chip2);
    fireDrag(chip1, "dragOver", { clientX: 4 });
    fireDrag(chip1, "drop", { clientX: 4 });

    expect(props.onReorder).toHaveBeenCalledTimes(1);
    expect(props.onReorder).toHaveBeenCalledWith(["p2", "p1"]);
  });

  it("uses first letter as fallback when icon is missing", async () => {
    await renderList({
      profiles: [profile({ id: "p1", name: "Trabalho", icon: null })],
    });
    const chip = screen.getByTestId("profile-chip-p1");
    expect(chip.textContent).toMatch(/T/);
  });

  it("renders the icon when provided", async () => {
    await renderList({
      profiles: [profile({ id: "p1", name: "Trabalho", icon: "💼" })],
    });
    const chip = screen.getByTestId("profile-chip-p1");
    expect(chip.textContent).toMatch(/💼/);
  });
});
