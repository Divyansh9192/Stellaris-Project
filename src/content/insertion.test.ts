import { describe, expect, it } from "vitest";

import { insertPlainText } from "./insertion";

describe("plain text insertion", () => {
  it("replaces the selected range in a textarea", () => {
    document.body.innerHTML = '<textarea>hello world</textarea>';
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;

    const inserted = insertPlainText(
      {
        kind: "textarea",
        element: textarea,
        start: 6,
        end: 11,
      },
      "friend",
    );

    expect(inserted).toBe(true);
    expect(textarea.value).toBe("hello friend");
  });

  it("inserts line breaks safely into contenteditable roots", () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">hello world</div>';
    const editor = document.querySelector("#editor") as HTMLDivElement;
    const textNode = editor.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 11);

    const inserted = insertPlainText(
      {
        kind: "contenteditable",
        root: editor,
        range,
      },
      "friend\nagain",
    );

    expect(inserted).toBe(true);
    expect(editor.innerHTML).toContain("friend");
    expect(editor.innerHTML).toContain("<br>");
  });
});
