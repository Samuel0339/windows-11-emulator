const { ScramjetController } = window.$scramjetLoadController();
const controller = new ScramjetController({
  files: {
    wasm: "/scram/scramjet.wasm.wasm",
    all: "/scram/scramjet.all.js",
    sync: "/scram/scramjet.sync.js"
  }
});
const transport = new BareMux.BareMuxConnection("/baremux/worker.js");
const addressForm = document.getElementById("addressForm");
const addressInput = document.getElementById("addressInput");
const browserAddressForm = document.getElementById("browserAddressForm");
const browserAddress = document.getElementById("browserAddress");
const searchPanel = document.getElementById("searchPanel");
const browser = document.getElementById("browser");
const browserViewport = document.getElementById("browserViewport");
const browserState = document.getElementById("browserState");
const notice = document.getElementById("notice");
const tabList = document.getElementById("tabList");
const tabs = [];
let activeTabId;
let nextTabId = 0;
let setupPromise;
const SEARCH_ENGINE_URL = "https://html.duckduckgo.com/html/?q=";

function normalizeAddress(value) {
  const address = value.trim();
  if (!address) throw new Error("Enter a website address or search term.");
  if (/\s/.test(address) || (!address.includes(".") && !address.includes(":") && !address.includes("/"))) {
    return `${SEARCH_ENGINE_URL}${encodeURIComponent(address)}`;
  }
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(address) ? address : `https://${address}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only public HTTP and HTTPS websites are supported.");
  }
  return url.href;
}

async function setupProxy() {
  if (!setupPromise) {
    setupPromise = (async () => {
      await controller.init();
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const websocket = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/wisp/`;
      if ((await transport.getTransport()) !== "/libcurl/index.mjs") {
        await transport.setTransport("/libcurl/index.mjs", [{ websocket }]);
      }
    })().catch(error => {
      setupPromise = undefined;
      throw error;
    });
  }
  return setupPromise;
}

function renderTabs() {
  tabList.replaceChildren();
  for (const tab of tabs) {
    const item = document.createElement("div");
    item.className = "tab-item";
    item.setAttribute("role", "presentation");

    const select = document.createElement("button");
    select.className = "tab-select";
    select.type = "button";
    select.id = `browser-tab-${tab.id}`;
    select.setAttribute("aria-controls", `browser-panel-${tab.id}`);
    select.setAttribute("role", "tab");
    select.setAttribute("aria-selected", String(tab.id === activeTabId));
    select.title = tab.title;
    const favicon = document.createElement("span");
    favicon.className = "tab-favicon";
    favicon.setAttribute("aria-hidden", "true");
    favicon.textContent = "↗";
    const title = document.createElement("span");
    title.textContent = tab.title;
    select.append(favicon, title);
    select.addEventListener("click", () => activateTab(tab.id));

    const close = document.createElement("button");
    close.className = "tab-close";
    close.type = "button";
    close.setAttribute("aria-label", `Close ${tab.title}`);
    close.title = `Close ${tab.title}`;
    close.textContent = "×";
    close.addEventListener("click", () => closeTab(tab.id));

    item.append(select, close);
    tabList.append(item);
  }
  tabList.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function activeTab() {
  return tabs.find(tab => tab.id === activeTabId);
}

function activateTab(id) {
  const tab = tabs.find(entry => entry.id === id);
  if (!tab) return;
  activeTabId = tab.id;
  for (const entry of tabs) entry.view.hidden = entry.id !== activeTabId;
  browserAddress.value = tab.url;
  browserAddress.title = tab.url;
  browserState.textContent = tab.url ? "Connected" : "New tab";
  renderTabs();
}

function createTab() {
  const id = ++nextTabId;
  const view = document.createElement("div");
  view.className = "tab-view";
  view.id = `browser-panel-${id}`;
  view.setAttribute("role", "tabpanel");
  view.setAttribute("aria-labelledby", `browser-tab-${id}`);
  view.innerHTML = '<div class="welcome"><span class="welcome-mark" aria-hidden="true">↗</span><strong>New tab</strong><span>Enter an address above to start browsing.</span></div>';
  browserViewport.append(view);
  const tab = { id, title: "New tab", url: "", view, frame: undefined };
  tabs.push(tab);
  activateTab(id);
  browser.classList.add("visible");
  searchPanel.style.display = "none";
  notice.style.display = "none";
  return tab;
}

function closeTab(id) {
  const index = tabs.findIndex(tab => tab.id === id);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  tab.view.remove();
  if (tabs.length === 0) {
    createTab();
  } else if (activeTabId === id) {
    activateTab(tabs[Math.min(index, tabs.length - 1)].id);
  } else {
    renderTabs();
  }
}

function createFrame(tab) {
  const frame = controller.createFrame();
  tab.frame = frame;
  frame.frame.className = "browser-frame";
  frame.frame.title = tab.title;
  frame.addEventListener("navigate", () => {
    if (tab.id === activeTabId) browserState.textContent = "Connecting";
  });
  frame.addEventListener("urlchange", event => {
    let url = String(event.url);
    try {
      url = controller.decodeUrl(url);
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return;
      tab.url = parsed.href;
      tab.title = parsed.hostname.replace(/^www\./, "") || parsed.hostname;
    } catch {
      return;
    }
    frame.frame.title = tab.title;
    renderTabs();
    if (tab.id === activeTabId) {
      browserAddress.value = tab.url;
      browserAddress.title = tab.url;
      browserState.textContent = "Connected";
    }
  });
  frame.frame.addEventListener("load", () => {
    if (tab.id === activeTabId) browserState.textContent = "Connected";
  });
  tab.view.replaceChildren(frame.frame);
  return frame;
}

async function navigate(value) {
  const url = normalizeAddress(value);
  let tab = activeTab();
  if (!tab) tab = createTab();
  tab.url = url;
  try {
    tab.title = new URL(url).hostname.replace(/^www\./, "") || "New tab";
  } catch {
    tab.title = "New tab";
  }
  renderTabs();
  activateTab(tab.id);
  addressInput.value = url;
  browserAddress.value = url;
  browserAddress.title = url;
  browserState.textContent = "Starting secure browser";
  try {
    await setupProxy();
    const frame = tab.frame || createFrame(tab);
    browserState.textContent = "Connecting";
    frame.go(url);
  } catch (error) {
    browserState.textContent = "Proxy setup failed";
    tab.view.innerHTML = `<p class="proxy-error">${escapeText(error.message)}</p>`;
    tab.frame = undefined;
  }
}

function escapeText(value) {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function returnHome() {
  for (const tab of tabs) tab.view.remove();
  tabs.length = 0;
  activeTabId = undefined;
  renderTabs();
  browser.classList.remove("visible");
  browserViewport.innerHTML = '<div class="welcome"><span class="welcome-mark" aria-hidden="true">↗</span><strong>Ready when you are</strong><span>Enter an address above to start browsing.</span></div>';
  searchPanel.style.display = "";
  notice.style.display = "";
  addressInput.value = "";
  addressInput.focus();
}

function reportAddressError(input, error) {
  input.setCustomValidity(error.message);
  input.reportValidity();
}

addressForm.addEventListener("submit", event => {
  event.preventDefault();
  try {
    navigate(addressInput.value);
  } catch (error) {
    reportAddressError(addressInput, error);
  }
});

browserAddressForm.addEventListener("submit", event => {
  event.preventDefault();
  try {
    navigate(browserAddress.value);
  } catch (error) {
    reportAddressError(browserAddress, error);
  }
});

for (const input of [addressInput, browserAddress]) {
  input.addEventListener("input", () => input.setCustomValidity(""));
}

document.querySelectorAll("[data-site]").forEach(button => {
  button.addEventListener("click", () => navigate(button.dataset.site));
});

document.getElementById("backButton").addEventListener("click", () => activeTab()?.frame?.back());
document.getElementById("forwardButton").addEventListener("click", () => activeTab()?.frame?.forward());
document.getElementById("reloadButton").addEventListener("click", () => activeTab()?.frame?.reload());
document.getElementById("homeButton").addEventListener("click", returnHome);
document.getElementById("newTabButton").addEventListener("click", () => {
  const tab = createTab();
  browserAddress.value = "";
  browserAddress.focus();
});

window.addEventListener("keydown", event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.key.toLowerCase() === "t") {
    event.preventDefault();
    createTab();
    browserAddress.value = "";
    browserAddress.focus();
  } else if (event.key.toLowerCase() === "w" && activeTab()) {
    event.preventDefault();
    closeTab(activeTabId);
  } else if (event.key.toLowerCase() === "l" && browser.classList.contains("visible")) {
    event.preventDefault();
    browserAddress.focus();
    browserAddress.select();
  }
});
