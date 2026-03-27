import type { ContentEditableInsertionTarget, InsertionTarget } from "./selection";
import { isEditableRoot } from "./selection";

const dispatchEditEvents = (element: HTMLElement | HTMLInputElement | HTMLTextAreaElement): void => {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const insertIntoTextField = (
  target: InsertionTarget & { kind: "text-input" | "textarea" },
  text: string,
): boolean => {
  const element = target.element;
  if (!element.isConnected || element.readOnly || element.disabled) {
    return false;
  }

  element.focus();
  element.setSelectionRange(target.start, target.end);
  element.setRangeText(text, target.start, target.end, "end");
  dispatchEditEvents(element);
  return true;
};

const createPlainTextFragment = (
  text: string,
): { fragment: DocumentFragment; lastNode: Node | null } => {
  const fragment = document.createDocumentFragment();
  const lines = text.split("\n");
  let lastNode: Node | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) {
      const breakNode = document.createElement("br");
      fragment.appendChild(breakNode);
      lastNode = breakNode;
    }

    if (lines[index].length > 0) {
      const textNode = document.createTextNode(lines[index]);
      fragment.appendChild(textNode);
      lastNode = textNode;
    }
  }

  if (!lastNode) {
    const textNode = document.createTextNode("");
    fragment.appendChild(textNode);
    lastNode = textNode;
  }

  return { fragment, lastNode };
};

const insertIntoContentEditable = (target: ContentEditableInsertionTarget, text: string): boolean => {
  if (!target.root.isConnected || !isEditableRoot(target.root)) {
    return false;
  }

  const selection = window.getSelection();
  if (!selection) {
    return false;
  }

  const range = target.range.cloneRange();
  const { fragment, lastNode } = createPlainTextFragment(text);

  selection.removeAllRanges();
  selection.addRange(range);

  range.deleteContents();
  range.insertNode(fragment);

  if (lastNode) {
    const afterRange = document.createRange();
    afterRange.setStartAfter(lastNode);
    afterRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(afterRange);
  }

  dispatchEditEvents(target.root);
  return true;
};

export const insertPlainText = (target: InsertionTarget | undefined, text: string): boolean => {
  if (!target || !text) {
    return false;
  }

  if (target.kind === "contenteditable") {
    return insertIntoContentEditable(target, text);
  }

  return insertIntoTextField(target, text);
};
