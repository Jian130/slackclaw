function timestampPrefix() {
  return new Date().toISOString();
}

function formatScope(scope) {
  return scope ? `[${scope}]` : "";
}

export function formatScriptLogLine({ label, scope, message }) {
  return `${timestampPrefix()} [${label}]${formatScope(scope)} ${message}`;
}

export function writeScriptLogLine({ label, scope, message, stream = "stdout" }) {
  const line = formatScriptLogLine({ label, scope, message });

  if (stream === "stderr") {
    console.error(line);
    return;
  }

  console.log(line);
}
