// Chrome 155 changed executeTool input from a JSON string to a JavaScript object.
// Select the documented contract before invocation; never retry a tool call.
// https://developer.chrome.com/docs/ai/webmcp/imperative-api#execute-tool
export function webMcpArguments(browserVersion, input) {
  const match = typeof browserVersion === 'string' && /^(\d+)(?:\.\d+){2,3}$/.exec(browserVersion);
  if (!match || Number(match[1]) < 1) throw new TypeError('Expected a Chromium browser version.');
  return Number(match[1]) < 155 ? JSON.stringify(input) : input;
}
