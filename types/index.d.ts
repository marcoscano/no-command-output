export type Visibility = { isHidden: boolean }

declare module 'claude-code' {
  interface PluginState {
    'no-command-output': { isHidden: boolean }
  }
}
