import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SliceContextMenu } from "../SliceContextMenu";

function renderMenu(onClose = vi.fn(), onOpenAll = vi.fn(), onEdit = vi.fn(), onDelete = vi.fn()) {
  const utils = render(
    <SliceContextMenu
      position={{ x: 100, y: 200 }}
      onClose={onClose}
      items={[
        { id: "open-all", label: "Abrir tudo", onSelect: onOpenAll },
        { id: "edit", label: "Editar", onSelect: onEdit },
        { id: "delete", label: "Excluir", onSelect: onDelete, variant: "danger" },
      ]}
    />,
  );
  return { ...utils, onClose, onOpenAll, onEdit, onDelete };
}

describe("SliceContextMenu", () => {
  it("renders all items", () => {
    const { getByTestId } = renderMenu();
    expect(getByTestId("slice-context-menu-open-all")).toBeTruthy();
    expect(getByTestId("slice-context-menu-edit")).toBeTruthy();
    expect(getByTestId("slice-context-menu-delete")).toBeTruthy();
  });

  it("invokes the item callback and onClose on click", () => {
    const { getByTestId, onClose, onEdit } = renderMenu();
    fireEvent.click(getByTestId("slice-context-menu-edit"));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape", () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on outside click", () => {
    const { onClose } = renderMenu();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when the click is inside the menu", () => {
    const { getByTestId, onClose } = renderMenu();
    fireEvent.mouseDown(getByTestId("slice-context-menu"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
