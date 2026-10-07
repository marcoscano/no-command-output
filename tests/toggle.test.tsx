import { expect, test } from 'claude-code/testing'
import type { RenderPropsOf } from 'claude-code'

const PLUGIN = 'no-command-output'
const RUN = {
  command: PLUGIN,
  args: '',
  origin: { kind: 'composer' } as const,
  presentation: { isFullscreen: false, columns: 80 },
}
const SURFACES = ['terminal', 'desktop'] as const
const OUTPUT = { stdout: 'one\ntwo\nthree\n', stderr: '', interrupted: false }
const RESULT: RenderPropsOf['ToolResult'] = {
  tool_use_id: 'call-1',
  tool: 'Bash',
  output: OUTPUT,
  isErrored: false,
}
const BASH_ROW: RenderPropsOf['ToolUse'] = {
  tool_use_id: 'call-1',
  tool: 'Bash',
  input: { command: 'ls' },
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  output: OUTPUT,
}
const READ_ROW: RenderPropsOf['ToolUse'] = {
  tool_use_id: 'call-2',
  tool: 'Read',
  input: { file_path: '/srv/app/web/modules/custom/common/common.module' },
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  output: {
    type: 'text',
    file: { filePath: '/srv/app/web/modules/custom/common/common.module', content: 'a\nb\n', numLines: 45, startLine: 1, totalLines: 45 },
  },
}
const ENGINE = { type: 'Text', text: 'engine drew it' }
const HIDDEN = { type: 'Text', text: /output hidden/ }

test('hides tool results from the start and shows them once turned off', async ($, on) => {
  // Stands for the engine's own result renderer beneath the plugin.
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine drew it</Text>
  })

  for (const surface of SURFACES) {
    await $.command.run({ ...RUN, args: 'on' })

    const hidden = await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolResult', props: RESULT })
    expect(await hidden.find(ENGINE), `${surface}: hidden by default`).toBeUndefined()
    expect((await hidden.find(HIDDEN))?.text).toContain('3 lines')
    await hidden.unmount()

    const errored = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'ToolResult',
      props: { ...RESULT, isErrored: true },
    })
    expect(await errored.find(ENGINE), `${surface}: errors stay visible`).toBeDefined()
    await errored.unmount()

    const turnedOff = await $.command.run({ ...RUN, args: 'off' })
    expect(turnedOff.text).toContain('shown')

    const shown = await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolResult', props: RESULT })
    expect(await shown.find(ENGINE), `${surface}: shown once off`).toBeDefined()
    await shown.unmount()

    const turnedOn = await $.command.run(RUN)
    expect(turnedOn.text).toContain('hidden')

    const again = await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolResult', props: RESULT })
    expect(await again.find(ENGINE), `${surface}: hidden again once toggled`).toBeUndefined()
    await again.unmount()
  }
})

test('starts with output shown when hiddenByDefault is off', { options: { hiddenByDefault: false } }, async ($, on) => {
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine drew it</Text>
  })

  for (const surface of SURFACES) {
    const shown = await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolResult', props: RESULT })
    expect(await shown.find(ENGINE), `${surface}: shown by default`).toBeDefined()
    await shown.unmount()
  }

  // The toggle with no argument flips from the option's default.
  const turnedOn = await $.command.run(RUN)
  expect(turnedOn.text).toContain('hidden')
  const hidden = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'ToolResult', props: RESULT })
  expect(await hidden.find(ENGINE)).toBeUndefined()
  await hidden.unmount()
})

test('rewrites the inline output of a Bash row while the mode is on', async ($, on) => {
  // Stands for the engine's row renderer: it draws whatever stdout it is handed.
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    const output = e.props.output as { stdout?: string } | undefined
    return <Text>{output?.stdout ?? 'engine drew it'}</Text>
  })

  for (const surface of SURFACES) {
    await $.command.run({ ...RUN, args: 'on' })

    const hidden = await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolUse', props: BASH_ROW })
    expect(await hidden.find({ type: 'Text', text: /one/ }), `${surface}: stdout hidden by default`).toBeUndefined()
    expect((await hidden.find(HIDDEN))?.text).toContain('3 lines')
    await hidden.unmount()

    const errored = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'ToolUse',
      props: { ...BASH_ROW, isErrored: true },
    })
    expect(await errored.find({ type: 'Text', text: /one/ }), `${surface}: errors stay visible`).toBeDefined()
    await errored.unmount()

    const running = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'ToolUse',
      props: { ...BASH_ROW, isRunning: true, output: undefined },
    })
    expect(await running.find(ENGINE), `${surface}: a running row is untouched`).toBeDefined()
    await running.unmount()

    await $.command.run({ ...RUN, args: 'off' })

    const shown = await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolUse', props: BASH_ROW })
    expect(await shown.find({ type: 'Text', text: /one/ }), `${surface}: stdout shown once off`).toBeDefined()
    await shown.unmount()
  }
})

test('draws its own row for any other tool while the mode is on', async ($, on) => {
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine drew it</Text>
  })

  for (const surface of SURFACES) {
    await $.command.run({ ...RUN, args: 'on' })

    const hidden = await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolUse', props: READ_ROW })
    expect(await hidden.find(ENGINE), `${surface}: the engine's row is not drawn`).toBeUndefined()
    expect(await hidden.find({ type: 'Text', text: /Read/ }), `${surface}: the header names the tool`).toBeDefined()
    expect(await hidden.find({ type: 'Text', text: /common\.module/ }), `${surface}: the header names the file`).toBeDefined()
    expect((await hidden.find(HIDDEN))?.text).toContain('45 lines')
    await hidden.unmount()

    const errored = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'ToolUse',
      props: { ...READ_ROW, isErrored: true },
    })
    expect(await errored.find(ENGINE), `${surface}: errors stay visible`).toBeDefined()
    await errored.unmount()

    await $.command.run({ ...RUN, args: 'off' })

    const shown = await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolUse', props: READ_ROW })
    expect(await shown.find(ENGINE), `${surface}: the engine's row once off`).toBeDefined()
    await shown.unmount()
  }
})
