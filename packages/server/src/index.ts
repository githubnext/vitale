import * as vscode from "vscode";
export * from "./rpc-types";

export function text(data: string) {
  return { data, mime: "text/plain" };
}

export function textHtml(data: string) {
  return { data, mime: "text/x-html" };
}

export function textJson(data: string) {
  return { data, mime: "text/x-json" };
}

export function textMarkdown(data: string) {
  return { data, mime: "text/x-markdown" };
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

// VS Code API

const rpcKey = "__vitale_rpc__";

export function getSession(
  providerId: string,
  scopes: readonly string[],
  options: vscode.AuthenticationGetSessionOptions & {
    /** */ createIfNone: true;
  }
): Thenable<vscode.AuthenticationSession>;
export function getSession(
  providerId: string,
  scopes: readonly string[],
  options: vscode.AuthenticationGetSessionOptions & {
    /** literal-type defines return type */ forceNewSession:
      | true
      | vscode.AuthenticationForceNewSessionOptions;
  }
): Thenable<vscode.AuthenticationSession>;
export function getSession(
  providerId: string,
  scopes: readonly string[],
  options?: vscode.AuthenticationGetSessionOptions
): Thenable<vscode.AuthenticationSession | undefined>;
export function getSession() {
  // @ts-ignore
  return global[rpcKey].getSession(...arguments);
}

export function showInformationMessage<T extends string>(
  message: string,
  ...items: T[]
): Thenable<T | undefined>;
export function showInformationMessage<T extends string>(
  message: string,
  options: vscode.MessageOptions,
  ...items: T[]
): Thenable<T | undefined>;
export function showInformationMessage<T extends vscode.MessageItem>(
  message: string,
  ...items: T[]
): Thenable<T | undefined>;
export function showInformationMessage<T extends vscode.MessageItem>(
  message: string,
  options: vscode.MessageOptions,
  ...items: T[]
): Thenable<T | undefined>;
export function showInformationMessage() {
  // @ts-ignore
  return global[rpcKey].showInformationMessage(...arguments);
}

export function showWarningMessage<T extends string>(
  message: string,
  ...items: T[]
): Thenable<T | undefined>;
export function showWarningMessage<T extends string>(
  message: string,
  options: vscode.MessageOptions,
  ...items: T[]
): Thenable<T | undefined>;
export function showWarningMessage<T extends vscode.MessageItem>(
  message: string,
  ...items: T[]
): Thenable<T | undefined>;
export function showWarningMessage<T extends vscode.MessageItem>(
  message: string,
  options: vscode.MessageOptions,
  ...items: T[]
): Thenable<T | undefined>;
export function showWarningMessage() {
  // @ts-ignore
  return global[rpcKey].showWarningMessage(...arguments);
}

export function showErrorMessage<T extends string>(
  message: string,
  ...items: T[]
): Thenable<T | undefined>;
export function showErrorMessage<T extends string>(
  message: string,
  options: vscode.MessageOptions,
  ...items: T[]
): Thenable<T | undefined>;
export function showErrorMessage<T extends vscode.MessageItem>(
  message: string,
  ...items: T[]
): Thenable<T | undefined>;
export function showErrorMessage<T extends vscode.MessageItem>(
  message: string,
  options: vscode.MessageOptions,
  ...items: T[]
): Thenable<T | undefined>;
export function showErrorMessage() {
  // @ts-ignore
  return global[rpcKey].showErrorMessage(...arguments);
}
