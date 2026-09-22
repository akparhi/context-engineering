---
name: uninstall
description: Remove Switchboard startup files while preserving provider credentials.
disable-model-invocation: true
allowed-tools: Bash
---

Run:

```sh
"$HOME/.local/share/switchboard/bin/switchboard-ctl" uninstall
```

Tell the user that Switchboard startup files and its marked shell block were removed.
Provider credentials remain in their provider stores. The command does not remove
Claude plugins; tell the user to remove those through `/plugin` when needed.
Never accept credentials in chat.
