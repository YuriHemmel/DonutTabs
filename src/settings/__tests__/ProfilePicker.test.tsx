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
  ...overrides,
});

async function renderPicker(
  overrides: Partial<{
    profiles: Profile[];
    selectedId: string;
    activeId: string;
    onSelect: (id: string) => void;
    onCreate: () => void;
    onDelete: (id: string) => void;
  }> = {},
) {
  const i18n = await createI18n("pt-BR");
  const props = {
    profiles: [profile()],
    selectedId: "p1",
    activeId: "p1",
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn(),
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

  it("appends activeMarker only to the active profile option", async () => {
    await renderPicker({
      profiles: [
        profile({ id: "p1", name: "Padrão" }),
        profile({ id: "p2", name: "Estudo" }),
      ],
      selectedId: "p1",
      activeId: "p2",
    });
    const select = screen.getByTestId("profile-select") as HTMLSelectElement;
    const opts = Array.from(select.options);
    expect(opts.find((o) => o.value === "p1")?.text).not.toMatch(/ativo/i);
    expect(opts.find((o) => o.value === "p2")?.text).toMatch(/ativo/i);
  });

  it("prefixes the icon to the option label when icon is set", async () => {
    await renderPicker({
      profiles: [profile({ id: "p1", name: "Trabalho", icon: "💼" })],
    });
    const select = screen.getByTestId("profile-select") as HTMLSelectElement;
    expect(select.options[0].text).toMatch(/^💼\s+Trabalho/);
  });

  it("calls onSelect with the chosen profile id when select changes", async () => {
    const user = userEvent.setup();
    const { props } = await renderPicker({
      profiles: [profile(), profile({ id: "p2", name: "Estudo" })],
      selectedId: "p1",
    });
    await user.selectOptions(screen.getByTestId("profile-select"), "p2");
    expect(props.onSelect).toHaveBeenCalledWith("p2");
  });

  it("calls onCreate when the new button is clicked", async () => {
    const user = userEvent.setup();
    const { props } = await renderPicker();
    await user.click(screen.getByTestId("profile-create"));
    expect(props.onCreate).toHaveBeenCalledTimes(1);
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
