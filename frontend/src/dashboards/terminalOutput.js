const pathPattern = /(?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)+(?:\/|:\d+)?|\b[\w.-]+\.(?:js|jsx|ts|tsx|py|json|css|html)(?::\d+)?/g

export function classifyTerminalLine(line, stream = 'stdout') {
  if (stream === 'stderr' || /^\s*(?:error|failed|failure|fatal)\b/i.test(line)) return 'error'
  if (/^\s*(?:warning|warn)\b/i.test(line)) return 'warning'
  if (/^\s*(?:success|passed|completed|ok)\b/i.test(line)) return 'success'
  if (/^\s*(?:info|note|queued|running)\b/i.test(line)) return 'info'
  if (/^\s*(?:\$|>)\s/.test(line)) return 'command'
  return 'output'
}

export function splitTerminalPaths(line) {
  const result = []
  let offset = 0
  for (const match of line.matchAll(pathPattern)) {
    if (match.index > offset) result.push({ type: 'text', value: line.slice(offset, match.index) })
    result.push({ type: 'path', value: match[0] })
    offset = match.index + match[0].length
  }
  if (offset < line.length) result.push({ type: 'text', value: line.slice(offset) })
  return result.length ? result : [{ type: 'text', value: line }]
}
