import { describe, expect, it } from "vitest";

import { interpolateTemplate } from "./template";

describe("template interpolation", () => {
  it("replaces only the supported template variables", () => {
    const result = interpolateTemplate(
      "{{selection}} | {{pageTitle}} | {{pageUrl}} | {{unknown}}",
      {
        text: "hello",
        pageTitle: "Inbox",
        pageUrl: "https://example.com/mail",
        canInsert: false,
        sourceKind: "none",
      },
    );

    expect(result).toBe("hello | Inbox | https://example.com/mail | {{unknown}}");
  });
});
