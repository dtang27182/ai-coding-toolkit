# UI DSL for VS Code

This extension highlights `.ui.dsl` files. It recognizes application, backend, page, element, and property declarations, and uses VS Code's TypeScript grammar inside `content_state` and `on_click` blocks and backend method signatures.

To try it from this repository, run:

```sh
code --extensionDevelopmentPath="$(pwd)/common/ui-spec/vscode-extension" common/ui-spec/ui-root.example.ui.dsl
```

To install it, run `npx @vscode/vsce package` from this directory, then install the resulting `.vsix` with VS Code's **Extensions: Install from VSIX...** command.
