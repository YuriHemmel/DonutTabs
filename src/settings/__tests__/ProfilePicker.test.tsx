import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { ProfilePicker } from "../ProfilePicker";
import type { Profile } from "../../core/types/Profile";

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: "p1",
  name: "Padrão",
  icon: null,
  shortcut: "Ctrl+Space",
  theme: "dark",
  tabs: [],
  allowScripts: false,
  ...overrides,
});

async function renderPicker(
  overrides: Partial<{
    profiles: Profile[];
    selectedId: string;
    activeId: string;
    onSelect: (id: string) => void;
    onCreate: () => void;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onReorder: (ids: string[]) => void;
  }> = {},
) {
  const i18n = await createI18n("pt-BR");
  const props = {
    profiles: [profile()],
    selectedId: "p1",
    activeId: "p1",
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <ProfilePicker {...props} />
    </I18nextProvider>,
  );
  return { ...utils, props };
}

describe("ProfilePicker", () => {
  it("hides delete button when only one profile exists", async () => {
    await renderPicker({ profiles: [profile()] });
    expect(screen.queryByTestId("profile-delete")).toBeNull();
  });

  it("shows delete button when there are 2+ profiles", async () => {
    await renderPicker({
      profiles: [profile(), profile({ id: "p2", name: "Estudo" })],
    });
    expect(screen.getByTestId("profile-delete")).toBeTruthy();
  });

  it("renders chips for every profile via DraggableProfileList", async () => {
    await renderPicker({
      profiles: [
        profile({ id: "p1", name: "Padrão" }),
        profile({ id: "p2", name: "Estudo" }),
      ],
    });
    expect(screen.getByTestId("profile-chip-p1")).toBeTruthy();
    expect(screen.getByTestId("profile-chip-p2")).toBeTruthy();
  });

  it("active profile shows the gold marker", async () => {
    await renderPicker({
      profiles: [
        profile({ id: "p1", name: "Padrão" }),
        profile({ id: "p2", name: "Estudo" }),
      ],
      selectedId: "p1",
      activeId: "p2",
    });
    expect(screen.getByTestId("profile-chip-active-p2")).toBeTruthy();
    expect(screen.queryByTestId("profile-chip-active-p1")).toBeNull();
  });

  it("calls onSelect when a chip is clicked", async () => {
    const user = userEvent.setup();
    const { props } = await renderPicker({
      profiles: [profile(), profile({ id: "p2", name: "Estudo" })],
      selectedId: "p1",
    });
    await user.click(screen.getByTestId("profile-chip-p2"));
    expect(props.onSelect).toHaveBeenCalledWith("p2");
  });

  it("calls onCreate when the new button is clicked", async () => {
    const user = userEvent.setup();
    const { props } = await renderPicker();
    await user.click(screen.getByTestId("profile-create"));
    expect(props.onCreate).toHaveBeenCalledTimes(1);
  });

  it("calls onEdit with the currently selected id when edit is clicked", async () => {
    const user = userEvent.setup();
    const { props } = await renderPicker({
      profiles: [profile(), profile({ id: "p2", name: "Estudo" })],
      selectedId: "p2",
    });
    await user.click(screen.getByTestId("profile-edit"));
    expect(props.onEdit).toHaveBeenCalledWith("p2");
  });

  it("calls onDelete with the currently selected id when delete is clicked", async () => {
    const user = userEvent.setup();
    const { props } = await renderPicker({
      profiles: [profile(), profile({ id: "p2", name: "Estudo" })],
      selectedId: "p2",
    });
    await user.click(screen.getByTestId("profile-delete"));
    expect(props.onDelete).toHaveBeenCalledWith("p2");
  });
});
