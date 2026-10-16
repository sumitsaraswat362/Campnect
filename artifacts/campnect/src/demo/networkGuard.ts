import { DEMO_MODE } from "./config";
// The Axios adapter is the only application data transport in demo mode.
// Fail closed for accidental fetch integrations, including production origins.
if (DEMO_MODE && typeof window !== "undefined") {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.href,
    );
    if (
      url.protocol === "blob:" ||
      url.protocol === "data:" ||
      (url.origin === window.location.origin &&
        !/^\/(api|uploads|socket\.io)(\/|$)/.test(url.pathname))
    )
      return originalFetch(input, init);
    const error = new Error(
      `Demo Mode blocked remote data request: ${url.origin}${url.pathname}`,
    );
    console.error(error.message);
    return Promise.reject(error);
  };
}
