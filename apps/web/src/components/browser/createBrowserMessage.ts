export function createBrowserMessage(
  requestId: string,
  instanceId: string,
  profileKey: string | undefined,
  initialUrl: string | null,
  size: { width: number; height: number },
) {
  return { type: "browser.create", requestId, instanceId, ...(profileKey ? { profileKey } : {}), ...(initialUrl ? { initialUrl } : {}), ...size };
}
