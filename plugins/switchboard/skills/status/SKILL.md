---
name: status
description: Show enabled Switchboard providers and the local runtime status.
disable-model-invocation: true
allowed-tools: Bash
---

Run:

```sh
"$HOME/.local/share/switchboard/bin/switchboard-ctl" status
```

Tell the user which providers are enabled and whether the helper is installed.
This command does not test provider authentication or inference. If it is missing,
tell the user to run `/switchboard:setup`. Never accept credentials in chat.
