const DEFAULT_TIMEOUT_MS = 12_000;

/** Prevent a stalled API connection from keeping a screen in a loading state forever. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const sourceSignal = init.signal;
  const abortFromSource = () => controller.abort();
  if (sourceSignal?.aborted) controller.abort();
  else sourceSignal?.addEventListener('abort', abortFromSource, { once: true });

  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    sourceSignal?.removeEventListener('abort', abortFromSource);
  }
}
