// Isolated-world content script: relays captured Webcast frames from the MAIN
// world hook to the extension service worker. No page data is modified.
(() => {
  function send(message) {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch { /* extension was reloaded while this tab stayed open */ }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "tokflow-reader") return;
    if (!["capture-open", "capture-frame", "capture-close", "capture-hooked"].includes(event.data.kind)) return;
    send({
      type: event.data.kind === "capture-hooked" ? "capture-ready" : event.data.kind,
      url: event.data.url,
      payload: event.data.payload,
      page: event.data.page
    });
  });

  send({ type: "capture-ready", page: location.href });
})();
