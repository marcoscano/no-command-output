# no-command-output

A Claude Code plugin that hides tool output in the transcript, so you see which
commands ran and which files were touched without the noise of their results.
Toggle it with `/no-command-output`.

- Every finished tool row shows a one-line placeholder, `output hidden (12 lines)`,
  instead of its output. The command or file in the row's header still shows.
- Failed, interrupted and still-running calls are left alone: the error is what
  you want to read.
- Works in the default and fullscreen (`/tui`) renderers, with and without
  `verbose`, on the terminal and in the desktop app.
- Output is hidden from the start of every session. Change that under
  `/config` → "Hide tool output by default".
- The status line reads `tool output hidden` while the mode is on.

## Install

From the prompt of a terminal session:

```
/plugin install no-command-output --marketplace marcoscano/no-command-output
```

Answer `y` to add the marketplace, pick the user scope, and accept or change the
one option. The plugin is active in that session and in every session after.

## Usage

| Command | Effect |
| --- | --- |
| `/no-command-output` | Toggle for the current session |
| `/no-command-output on` (or `hide`) | Hide output |
| `/no-command-output off` (or `show`) | Show output |

The session's toggle wins over the `/config` default until the session ends.

## How it works

The plugin is a hooks module (`hooks/register.tsx`) with two `ui.render` hooks:

- `ToolResult`, the result block under a standalone row, is replaced by the
  placeholder for any tool.
- `ToolUse`, the row itself, draws its result inline in expanded groups and in
  the fullscreen renderer. A Bash row keeps the engine's own header with its
  `stdout` rewritten to the placeholder. Any other tool gets a row drawn by the
  plugin (`⏺ Read(path)` and the placeholder), because a rewritten result has to
  fit that tool's own output schema.

The mode lives in `$.state` for the session; the manifest's `hiddenByDefault`
option (`.claude-plugin/plugin.json`) applies until the session toggles it.

## Development

Clone the repository and run Claude Code against the checkout:

```
claude --plugin-dir /path/to/no-command-output
```

Or link it under `~/.claude/skills/no-command-output`: a plugin folder there
loads in every interactive session, and a save reloads it in place.

Check and test it against the engine:

```
claude plugin validate .
claude plugin test .
```

Once the plugin has loaded in a session, Claude Code writes its API types to
`.claude-plugin/types/` (ignored by git), and `tsc -p .` type-checks the module.

Notes for changes:

- Reach `$.state` directly (`$.state.get`, `$.state.set`); never pass `$` to an
  imported helper, which some builds' module loader refuses.
- Declare every `$.state` key in `types/index.d.ts`; `claude plugin validate`
  holds the module to that contract.
- Add or adjust a test in `tests/` for the behaviour you change.

Tested with Claude Code 2.1.292.

## License

MIT, see `LICENSE`.
