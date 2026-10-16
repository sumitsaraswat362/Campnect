import {
  AxiosError,
  CanceledError,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from "axios";
import { demoStore, commit } from "./store";
import { getMedia, putMedia } from "./media";
import type { DemoState, Row } from "./seed";

import { dispatch, DemoError } from "./repository";

async function body(config: InternalAxiosRequestConfig): Promise<Row> {
  if (config.data instanceof FormData) {
    const b: Row = {},
      media: string[] = [];
    for (const [key, v] of config.data.entries()) {
      if (v instanceof Blob) {
        const url = await putMedia(v);
        if (key === "media") media.push(url);
        else b[`${key}_url`] = url;
      } else if (key === "data") Object.assign(b, JSON.parse(v));
      else b[key] = v;
    }
    if (media.length) b.media = media;
    return b;
  }
  return typeof config.data === "string"
    ? JSON.parse(config.data)
    : config.data || {};
}
let queue: Promise<unknown> = Promise.resolve();
export const demoAdapter: AxiosAdapter = (config) => {
  const work = async () => {
    if (config.signal?.aborted) throw new CanceledError();
    const method = config.method || "get",
      parsed = new URL(config.url || "/", "http://demo.local");
    parsed.pathname = parsed.pathname.replace(/^\/api(?=\/)/, "");
    const q = { ...Object.fromEntries(parsed.searchParams), ...config.params };
    const token = String(config.headers.Authorization || "").replace(
      "Bearer ",
      "",
    );
    const me = token.startsWith("demo:") ? token.slice(5) : "";
    const s = structuredClone(demoStore.getState().data);
    try {
      const result = await dispatch(
        s,
        me,
        method,
        parsed.pathname,
        await body(config),
        q,
      );
      if (config.signal?.aborted) throw new CanceledError();
      if (
        method !== "get" ||
        parsed.pathname.endsWith("/messages") ||
        parsed.pathname.endsWith("/chat")
      )
        commit(s);
      const raw =
        parsed.pathname === "/app-update" ||
        parsed.pathname === "/maintenance" ||
        config.responseType === "blob";
      return {
        data: raw ? result.data : { success: true, ...result },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    } catch (err) {
      if (err instanceof CanceledError) throw err;
      const status = err instanceof DemoError ? err.status : 400;
      const message =
        err instanceof Error ? err.message : "Local demo request failed.";
      console.error(
        `[Demo] ${method.toUpperCase()} ${parsed.pathname}: ${message}`,
      );
      throw new AxiosError(message, "ERR_DEMO", config, undefined, {
        data: { success: false, error: message },
        status,
        statusText: "Demo error",
        headers: {},
        config,
      });
    }
  };
  const result = queue.then(work, work);
  queue = result.catch(() => undefined);
  return result;
};
