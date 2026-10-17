export interface RetryConfig {
  retries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  config: RetryConfig = {}
): Promise<Response> {
  const { retries = 3, initialDelayMs = 300, backoffFactor = 2 } = config;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(input, init);
      if (response.ok || response.status < 500) {
        return response;
      }
      if (attempt === retries) return response;
    } catch (err) {
      if (attempt === retries) throw err;
    }
    const jitter = Math.random() * 100;
    await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    delay *= backoffFactor;
  }
  throw new Error('Network retry limit exceeded');
}
