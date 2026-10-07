import type { Register, RenderPropsOf } from 'claude-code'

const COMMAND = 'no-command-output'
const STATUS = 'tool output hidden'
// $.state is reached directly ($.state.get / $.state.set), never through an
// imported helper: the module loader follows `$` only within this file.
const IS_HIDDEN = { plugin: 'no-command-output', key: 'isHidden' } as const

/** The input fields a row's one-line summary prefers, in order. */
const SUMMARY_KEYS = [
  'command',
  'file_path',
  'notebook_path',
  'path',
  'pattern',
  'query',
  'url',
  'skill',
  'description',
  'prompt',
] as const
const SUMMARY_WIDTH = 100

type BashOutput = { stdout: string; stderr: string; interrupted: boolean }
type ToolUseProps = RenderPropsOf['ToolUse']

/** Counts the lines of a text, one trailing newline not counted as a line. */
const linesOf = (text: string): number =>
  text.length === 0 ? 0 : text.replace(/\n$/, '').split('\n').length

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** True for the record Bash resolves: `{ stdout, stderr, interrupted }`. */
const isBashOutput = (output: unknown): output is BashOutput =>
  isRecord(output) && typeof output.stdout === 'string' && typeof output.stderr === 'string'

/** Describes how much a result holds, for the placeholder line. */
const sizeOf = (output: unknown): string => {
  if (typeof output === 'string') return `${linesOf(output)} lines`
  if (!isRecord(output)) return ''
  const parts: string[] = []
  if (typeof output.stdout === 'string' && output.stdout.length > 0) {
    parts.push(`${linesOf(output.stdout)} lines`)
  }
  if (typeof output.stderr === 'string' && output.stderr.length > 0) {
    parts.push(`${linesOf(output.stderr)} lines of stderr`)
  }
  if (parts.length > 0) return parts.join(', ')
  // Read resolves `{ file: { numLines } }`; Write, WebFetch and a forked Skill
  // carry their text under one of these keys.
  if (isRecord(output.file) && typeof output.file.numLines === 'number') {
    return `${output.file.numLines} lines`
  }
  for (const key of ['content', 'result', 'text'] as const) {
    const text = output[key]
    if (typeof text === 'string' && text.length > 0) return `${linesOf(text)} lines`
  }
  // Edit and Write resolve a unified diff as `structuredPatch` hunks.
  if (Array.isArray(output.structuredPatch)) {
    let added = 0
    let removed = 0
    for (const hunk of output.structuredPatch) {
      if (!isRecord(hunk) || !Array.isArray(hunk.lines)) continue
      for (const line of hunk.lines) {
        if (typeof line !== 'string') continue
        if (line.startsWith('+')) added += 1
        else if (line.startsWith('-')) removed += 1
      }
    }
    if (added > 0 || removed > 0) return `+${added} -${removed}`
  }
  return ''
}

/** The one line drawn in place of a hidden result. */
const placeholder = (output: unknown): string => {
  const size = sizeOf(output)
  return `output hidden${size ? ` (${size})` : ''}`
}

/** One line naming what a call was given, as the row's header shows it. */
const summaryOf = (input: unknown): string => {
  if (typeof input === 'string') return shorten(input)
  if (!isRecord(input)) return ''
  for (const key of SUMMARY_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return shorten(value)
  }
  const first = Object.values(input).find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  return first === undefined ? '' : shorten(first)
}

const shorten = (text: string): string => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > SUMMARY_WIDTH ? `${line.slice(0, SUMMARY_WIDTH - 1)}…` : line
}

/** `on`/`hide` and `off`/`show` set the mode; anything else toggles it. */
const wanted = (args: string, current: boolean): boolean => {
  const word = args.trim().toLowerCase()
  if (word === 'on' || word === 'hide') return true
  if (word === 'off' || word === 'show') return false
  return !current
}

/** A finished, non-errored row whose result is on hand, the only kind hidden. */
const isHideable = (props: ToolUseProps): boolean =>
  !props.isRunning && !props.isErrored && !props.isInterrupted && props.output !== undefined

export const register: Register = (on, options) => {
  // The manifest's `hiddenByDefault` option stands until the session's own
  // toggle writes $.state; a reload keeps that state, a new session starts over.
  const hidden_by_default = options.hiddenByDefault !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Hide or show tool output in the transcript',
      argumentHint: '[on|off]',
      immediate: true,
    })
    const { value } = await $.state.get(IS_HIDDEN)
    $.ui.status((value ?? hidden_by_default) ? STATUS : undefined)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const { value } = await $.state.get(IS_HIDDEN)
    const hidden = wanted(e.args, value ?? hidden_by_default)
    await $.state.set(IS_HIDDEN, hidden)
    $.ui.status(hidden ? STATUS : undefined)

    return {
      text: hidden
        ? 'Tool output hidden. Commands still show; run /no-command-output again to bring their output back.'
        : 'Tool output shown again.',
    }
  })

  // A standalone tool row draws its result in its own ToolResult block.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    // A failed call keeps its output: the error is what you want to read.
    if (e.props.isErrored) return next(e)
    // Reading while drawing subscribes this row: a later set redraws it.
    const { value } = await $.state.get(IS_HIDDEN)
    if (!(value ?? hidden_by_default)) return next(e)

    const { Text } = $.ui.resolve(e)

    return <Text dimColor>⎿  {placeholder(e.props.output)}</Text>
  })

  // A row inside an expanded tool group (every group under `verbose`) and every
  // row of the fullscreen transcript draws its output inline from the ToolUse
  // props, so the rewrite happens here.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!isHideable(e.props)) return next(e)
    const { value } = await $.state.get(IS_HIDDEN)
    if (!(value ?? hidden_by_default)) return next(e)

    const { tool, input, output } = e.props
    // Bash's record keeps its shape with the placeholder as its stdout, which
    // the engine then draws under its own header as the one line of output.
    if (isBashOutput(output)) {
      return next({
        ...e,
        props: { ...e.props, output: { ...output, stdout: placeholder(output), stderr: '' } },
      })
    }

    // Any other tool's result has a schema of its own that a rewrite must fit,
    // so the row is drawn here instead: the call's header and the placeholder.
    const { Box, Text } = $.ui.resolve(e)
    const summary = summaryOf(input)

    return (
      <Box flexDirection="column">
        <Text>
          <Text color="success">⏺</Text> <Text bold>{tool}</Text>
          {summary ? `(${summary})` : ''}
        </Text>
        <Text dimColor>  ⎿  {placeholder(output)}</Text>
      </Box>
    )
  })
}
