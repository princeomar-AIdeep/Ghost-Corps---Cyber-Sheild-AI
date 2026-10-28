const languageByExtension = Object.freeze({
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  json: 'json',
  css: 'css',
  html: 'html',
  htm: 'html',
  sh: 'shell',
  bash: 'shell',
})

const keywords = {
  javascript: new Set('as async await break case catch class const continue debugger default delete do else export extends finally for from function get if implements import in instanceof let new of package private protected public return set static super switch this throw try typeof var void while with yield true false null undefined'.split(' ')),
  typescript: new Set('abstract any as asserts async await boolean break case catch class const constructor continue debugger declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface keyof let module namespace never new null number object of package private protected public readonly require return set static string super switch this throw true try type typeof undefined unique unknown var void while with yield'.split(' ')),
  python: new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' ')),
  json: new Set(['true', 'false', 'null']),
  shell: new Set('if then else elif fi for while in do done case esac function local export readonly return exit'.split(' ')),
  css: new Set(['important']),
  html: new Set(),
}

const identifierPattern = /^[A-Za-z_$][\w$]*/
const numberPattern = /^(?:0[xX][\da-fA-F]+|0[bB][01]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/
const bracketOpen = new Set(['(', '[', '{'])
const bracketClose = new Map([[')', '('], [']', '['], ['}', '{']])

export function detectLanguage(filePath = '') {
  const extension = filePath.split('.').pop()?.toLowerCase()
  return languageByExtension[extension] || 'plain text'
}

function commentPattern(language) {
  if (language === 'python' || language === 'shell') return /^#[^\n]*/
  if (language === 'html') return /^<!--[\s\S]*?-->/
  if (language === 'javascript' || language === 'typescript' || language === 'css') {
    return /^(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/
  }
  return null
}

function stringPattern(language) {
  if (language === 'json') return /^"(?:\\.|[^"\\])*"?/
  return /^(?:"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|`(?:\\.|[^`\\])*`?)/
}

function classifyIdentifier(identifier, language, followingText) {
  if (keywords[language]?.has(identifier)) return 'keyword'
  if (language === 'css' && followingText.startsWith(':')) return 'property'
  if (
    followingText.startsWith('(') ||
    /^\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(followingText)
  ) return 'function'
  if (/^[A-Z]/.test(identifier)) return 'type'
  return 'variable'
}

export function tokenizeCode(source = '', filePath = '') {
  const text = String(source)
  const language = detectLanguage(filePath)
  if (language === 'plain text') return [{ type: 'plain', text }]

  const comments = commentPattern(language)
  const tokens = []
  let offset = 0
  while (offset < text.length) {
    const remaining = text.slice(offset)
    const comment = comments?.exec(remaining)?.[0]
    const string = stringPattern(language).exec(remaining)?.[0]
    const number = numberPattern.exec(remaining)?.[0]
    const identifier = identifierPattern.exec(remaining)?.[0]
    let type = 'plain'
    let value = remaining[0]

    if (comment && (!string || comment.length >= string.length) && remaining[0] === comment[0]) {
      type = 'comment'
      value = comment
    } else if (string && remaining[0] === string[0]) {
      type = 'string'
      value = string
    } else if (number && remaining[0] === number[0]) {
      type = 'number'
      value = number
    } else if (identifier && remaining[0] === identifier[0]) {
      const followingText = remaining.slice(identifier.length).trimStart()
      type = classifyIdentifier(identifier, language, followingText)
      value = identifier
    } else if (language === 'html' && remaining[0] === '<') {
      const tag = /^<\/?[A-Za-z][\w:-]*/.exec(remaining)?.[0]
      if (tag) {
        type = 'tag'
        value = tag
      }
    }

    const previous = tokens[tokens.length - 1]
    if (previous?.type === type) previous.text += value
    else tokens.push({ type, text: value })
    offset += value.length
  }

  const stack = []
  for (const token of tokens) {
    if (token.type === 'comment' || token.type === 'string') continue
    const pieces = [...token.text]
    for (let index = 0; index < pieces.length; index += 1) {
      const character = pieces[index]
      if (bracketOpen.has(character)) {
        stack.push({ token, index, character })
      } else if (bracketClose.has(character)) {
        const open = stack.pop()
        if (!open || open.character !== bracketClose.get(character)) {
          pieces[index] = { error: character }
        }
      }
    }
    token.characters = pieces
  }
  for (const open of stack) {
    open.token.characters[open.index] = { error: open.character }
  }

  return tokens.map(({ type, text: tokenText, characters }) => {
    if (!characters?.some((character) => typeof character === 'object')) {
      return { type, text: tokenText }
    }
    return {
      type,
      parts: characters.map((character) => (
        typeof character === 'object'
          ? { type: 'error', text: character.error }
          : { type, text: character }
      )),
    }
  })
}
