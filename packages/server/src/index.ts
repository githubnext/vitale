export * from "./rpc-types";

export function text(data: string) {
  return { data, mime: "text/plain" };
}

export function stream(data: string) {
  return { data, mime: "application/x.notebook.stream" };
}

export function markdown(data: string) {
  return { data, mime: "text/markdown" };
}

export function html(html: string | { outerHTML: string }) {
  const data = typeof html === "object" ? html.outerHTML : html;
  return { data, mime: "text/html" };
}

export function svg(html: string | { outerHTML: string }) {
  const data = typeof html === "object" ? html.outerHTML : html;
  return { data, mime: "image/svg+xml" };
}

export function json(obj: object) {
  return { data: JSON.stringify(obj), mime: "application/json" };
}

export function jsonView(obj: object) {
  return { data: JSON.stringify(obj), mime: "application/x-json-view" };
}
