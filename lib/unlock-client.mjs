export function getUnlockPreflightError(protocol) {
  if (protocol === "file:") {
    return "Run Ascenta through Vercel or `vercel dev` - `file://` cannot reach /api/unlock.";
  }

  return "";
}
