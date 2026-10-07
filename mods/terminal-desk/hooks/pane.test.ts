import { test, expect } from 'claude-code/testing'

test('pane shows the limits and session panels', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'terminal-desk', surface, component: 'Pane', requestId: 'desk', props: { bodyColumns: 60 } } as never)
    expect(await ui.find({ type: 'Text', text: /Plan limits/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /This session/ })).toBeDefined()
    await ui.unmount()
  }
})
