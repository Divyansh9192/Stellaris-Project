import type { SelectionContext } from "./types";

type TemplateToken = "selection" | "pageTitle" | "pageUrl";

const TEMPLATE_PATTERN = /{{\s*(selection|pageTitle|pageUrl)\s*}}/g;

const resolveTemplateToken = (token: TemplateToken, context: SelectionContext): string => {
  switch (token) {
    case "selection":
      return context.text;
    case "pageTitle":
      return context.pageTitle;
    case "pageUrl":
      return context.pageUrl;
    default:
      return "";
  }
};

export const interpolateTemplate = (template: string, context: SelectionContext): string =>
  template.replace(TEMPLATE_PATTERN, (_match, token: TemplateToken) =>
    resolveTemplateToken(token, context),
  );
