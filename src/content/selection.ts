import type { SelectionContext, SourceKind } from "../shared/types";

export interface InputInsertionTarget {
  kind: "text-input" | "textarea";
  element: HTMLInputElement | HTMLTextAreaElement;
  start: number;
  end: number;
}

export interface ContentEditableInsertionTarget {
  kind: "contenteditable";
  root: HTMLElement;
  range: Range;
}

export type InsertionTarget = InputInsertionTarget | ContentEditableInsertionTarget;

export interface SelectionSnapshot {
  context: SelectionContext;
  rect: DOMRect;
  insertionTarget?: InsertionTarget;
}

const SUPPORTED_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email"]);

export const isEditableRoot = (element: HTMLElement): boolean => {
  const contentEditable = element.getAttribute("contenteditable");
  return element.isContentEditable || contentEditable === "" || contentEditable === "true" || contentEditable === "plaintext-only";
};

const isSupportedInput = (element: Element | null): element is HTMLInputElement =>
  element instanceof HTMLInputElement &&
  SUPPORTED_INPUT_TYPES.has((element.type || "text").toLowerCase()) &&
  !element.readOnly &&
  !element.disabled;

const isSupportedTextarea = (element: Element | null): element is HTMLTextAreaElement =>
  element instanceof HTMLTextAreaElement && !element.readOnly && !element.disabled;

const getSourceKindFromTarget = (target?: InsertionTarget): SourceKind => {
  if (!target) {
    return "none";
  }

  return target.kind;
};

const getSelectionRect = (range: Range): DOMRect => {
  const clientRect = range.getBoundingClientRect();
  if (clientRect.width > 0 || clientRect.height > 0) {
    return clientRect;
  }

  const firstClientRect = range.getClientRects().item(0);
  if (firstClientRect) {
    return firstClientRect;
  }

  return new DOMRect(window.innerWidth / 2, 24, 0, 0);
};

const getContentEditableRoot = (node: Node | null): HTMLElement | null => {
  let current: Node | null = node;

  while (current) {
    if (current instanceof HTMLElement && isEditableRoot(current)) {
      return current;
    }
    current = current.parentNode;
  }

  return null;
};

const createContext = (text: string, insertionTarget?: InsertionTarget): SelectionContext => ({
  text,
  pageTitle: document.title,
  pageUrl: window.location.href,
  canInsert: Boolean(insertionTarget),
  sourceKind: getSourceKindFromTarget(insertionTarget),
});

const getInputSelection = (
  element: HTMLInputElement | HTMLTextAreaElement,
): SelectionSnapshot | null => {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;

  if (start === end) {
    return null;
  }

  const rawText = element.value.slice(start, end);
  const text = rawText.trim();
  if (!text) {
    return null;
  }

  const insertionTarget: InputInsertionTarget = {
    kind: element instanceof HTMLTextAreaElement ? "textarea" : "text-input",
    element,
    start,
    end,
  };

  return {
    context: createContext(text, insertionTarget),
    insertionTarget,
    rect: element.getBoundingClientRect(),
  };
};

const getWindowSelection = (): SelectionSnapshot | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const rawText = selection.toString();
  const text = rawText.trim();
  if (!text) {
    return null;
  }

  const range = selection.getRangeAt(0).cloneRange();
  const editableRoot = getContentEditableRoot(range.commonAncestorContainer);
  const insertionTarget = editableRoot
    ? ({
        kind: "contenteditable",
        root: editableRoot,
        range,
      } satisfies ContentEditableInsertionTarget)
    : undefined;

  return {
    context: createContext(text, insertionTarget),
    insertionTarget,
    rect: getSelectionRect(range),
  };
};

export const getCurrentSelectionSnapshot = (): SelectionSnapshot | null => {
  const activeElement = document.activeElement;
  if (isSupportedTextarea(activeElement) || isSupportedInput(activeElement)) {
    return getInputSelection(activeElement);
  }

  return getWindowSelection();
};
