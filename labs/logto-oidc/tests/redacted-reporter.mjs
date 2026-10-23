// Browser failures may include callback URLs in Playwright's call log.
// Only sanitized test diagnostics are emitted; never upload auth artifacts.
export function redact(message) {
  return String(message)
    .replace(/https?:\/\/[^\s"'<>]+/g, (value) => {
      try {
        const url = new URL(value);
        return url.origin + url.pathname + (url.search ? "?[redacted]" : "");
      } catch {
        return "[redacted-url]";
      }
    })
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi, "$1 [redacted]")
    .replace(/\b\d{6}\b/g, "[redacted-code]");
}
export default class Reporter {
  onTestEnd(test, result) {
    console.log(`[${result.status}] ${test.title}`);
    for (const error of result.errors)
      console.error(redact(error.stack ?? error.message ?? "Test failed"));
  }
  onError(error) {
    console.error(redact(error.message ?? "Test runner failed"));
  }
  onEnd(result) {
    console.log(`M013 real-provider result: ${result.status}`);
  }
}
