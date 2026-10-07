# Codespace Web Proxy

Personal browser-based proxy for public websites. It streams non-page responses, rewrites HTML/CSS and common browser requests, and blocks private or reserved IP addresses.

## Start

```sh
npm install
npm start
```

In Codespaces, open port `4173` from the **Ports** tab and keep its visibility set to **Private**. Enter a full website address in the proxy. Plain text searches use DuckDuckGo to avoid repeated anti-bot verification prompts. Press `Ctrl+C` in the terminal to stop the server.

The proxy requires internet access. Some sites that require WebSockets, service workers, DRM, or strict anti-proxy checks may not work. It cannot run Roblox or other native applications. Do not expose the forwarded port publicly.