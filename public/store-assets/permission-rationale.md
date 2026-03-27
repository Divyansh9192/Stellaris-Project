# Permission Rationale

- `storage`: save endpoint, selected model, custom actions, and granted-site labels locally.
- `scripting`: register the content script on approved sites and activate it immediately after the user grants access.
- `activeTab`: bootstrap the helper on the current tab from a user gesture without broad default access.
- `optional_host_permissions` for `http://*/*` and `https://*/*`: request access to the exact site the user chooses, rather than all sites up front.
- loopback host permissions for `http://localhost/*` and `http://127.0.0.1/*`: call the local Ollama API only.
