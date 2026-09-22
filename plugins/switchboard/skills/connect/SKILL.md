---
name: connect
description: Save an OpenCode API key without exposing it in chat.
disable-model-invocation: true
allowed-tools: Bash
---

Tell the user to run this command in a separate terminal:

```sh
"$HOME/.local/share/switchboard/bin/switchboard-ctl" connect opencode
```

The helper prompts privately and saves the key in OpenCode's auth store. Tell the
user to relaunch Claude afterward. Never accept, request, read, or print the key
in chat or pass it as a command argument.
