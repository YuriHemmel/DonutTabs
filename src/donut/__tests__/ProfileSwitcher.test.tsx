import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ProfileSwitcher } from "../ProfileSwitcher";
import type { Profile } from "../../core/types/Profile";

const profile = (id: string, name: string, overrides: Partial<Profile> = {}): Profile => ({
  id,
  name,
  icon: null,
  shortcut: "Ctrl+Space",
  theme: "dark",
  tabs: [],
  ...overrides,
});

function renderInSvg(ui: React.ReactElement) {
  return render(<svg width={400} height={400}>{ui}</svg>);
}

describe("ProfileSwitcher", () => {
  it("renders one slice per profile plus a '+' to create", () => {
    const profiles = [profile("a", "A"), profile("b", "B")];
    const { container } = renderInSvg(
      <ProfileSwitcher
        cx={200}
        cy={200}
        innerR={80}
        outerR={180}
        profiles={profiles}
        activeProfileId="a"
        onSelect={() => {}}
        onCreate={() => {}}
      />,
    );
    const slices = container.querySelectorAll('[data-testid="donut-slice"]');
    expect(slices.length).toBe(3); // 2 perfis + +
  });

  it("highlights the active profile with a marker", () => {
    const profiles = [profile("a", "A"), profile("b", "B")];
    const { container } = renderInSvg(
      <ProfileSwitcher
        cx={200}
        cy={200}
        innerR={80}
        outerR={180}
        profiles={profiles}
        activeProfileId="b"
        onSelect={() => {}}
        onCreate={() => {}}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-testid="active-profile-marker"]',
    );
    expect(markers.length).toBe(1);
  });

  it("calls onSelect with the profile id when its slice is clicked", () => {
    const onSelect = vi.fn();
    const profiles = [profile("a", "A"), profile("xyz", "X")];
    const { container } = renderInSvg(
      <ProfileSwitcher
        cx={200}
        cy={200}
        innerR={80}
        outerR={180}
        profiles={profiles}
        activeProfileId="a"
        onSelect={onSelect}
        onCreate={() => {}}
      />,
    );
    const slices = container.querySelectorAll('[data-testid="donut-slice"]');
    fireEvent.click(slices[1]); // segundo perfil
    expect(onSelect).toHaveBeenCalledWith("xyz");
  });

  it("calls onCreate when the trailing '+' slice is clicked", () => {
    const onCreate = vi.fn();
    const profiles = [profile("a", "A")];
    const { container } = renderInSvg(
      <ProfileSwitcher
        cx={200}
        cy={200}
        innerR={80}
        outerR={180}
        profiles={profiles}
        activeProfileId="a"
        onSelect={() => {}}
        onCreate={onCreate}
      />,
    );
    const slices = container.querySelectorAll('[data-testid="donut-slice"]');
    fireEvent.click(slices[1]); // último é o +
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
