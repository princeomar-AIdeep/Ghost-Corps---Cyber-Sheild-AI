import { useMemo } from 'react'
import { detectLanguage, tokenizeCode } from './codeHighlight.js'

function HighlightedCode({ tokens }) {
  return tokens.map((token, index) => token.parts
    ? token.parts.map((part, partIndex) => <span key={`${index}-${partIndex}`} className={`ide-token-${part.type}`}>{part.text}</span>)
    : <span key={index} className={`ide-token-${token.type}`}>{token.text}</span>)
}

export default function CodeEditor({ filePath, value, disabled, onChange }) {
  const tokens = useMemo(() => tokenizeCode(value, filePath), [value, filePath])
  const lineCount = Math.max(1, value.split('\n').length)
  const language = detectLanguage(filePath)

  return <div className="ide-editor" data-language={language}>
    <div className="ide-language-badge" aria-hidden="true">{language}</div>
    <div className="ide-editor-scroll">
      <div className="ide-editor-layout" style={{ minWidth: '100%' }}>
        <div className="ide-line-gutter" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}
        </div>
        <div className="ide-code-surface">
          <pre className="ide-highlight" aria-hidden="true"><HighlightedCode tokens={tokens} />{value.endsWith('\n') ? ' ' : null}</pre>
          <textarea
            className="ide-input"
            aria-label={`Edit ${filePath}`}
            spellCheck="false"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            value={value}
            disabled={disabled}
            onChange={onChange}
          />
        </div>
      </div>
    </div>
  </div>
}
