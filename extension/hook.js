// Runs at document_start in TikTok's MAIN world, before TikTok's own scripts.
// Wraps window.WebSocket so Webcast frames can be observed and relayed to the
// isolated-world bridge via postMessage. Read-only: frames are never altered.
(() => {
  if (window.__tokflowReaderInstalled) return;
  window.__tokflowReaderInstalled = true;

  const NativeWebSocket = window.WebSocket;
  const post = (kind, detail = {}) => window.postMessage({
    source: "tokflow-reader",
    kind,
    ...detail
  }, "*");

  async function encodePayload(data) {
    let buffer;
    if (data instanceof Blob) buffer = await data.arrayBuffer();
    else if (data instanceof ArrayBuffer) buffer = data;
    else if (ArrayBuffer.isView(data)) buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    else return "";

    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function attach(socket, url) {
    if (!String(url).includes("webcast")) return;
    socket.addEventListener("open", () => post("capture-open", { url: String(url) }));
    socket.addEventListener("message", async (event) => {
      const payload = await encodePayload(event.data).catch(() => "");
      if (payload) post("capture-frame", { url: String(url), payload });
    });
    socket.addEventListener("close", () => post("capture-close", { url: String(url) }));
  }

  function ReaderWebSocket(url, protocols) {
    const socket = protocols === undefined
      ? new NativeWebSocket(url)
      : new NativeWebSocket(url, protocols);
    attach(socket, url);
    return socket;
  }

  Object.setPrototypeOf(ReaderWebSocket, NativeWebSocket);
  ReaderWebSocket.prototype = NativeWebSocket.prototype;
  for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
    Object.defineProperty(ReaderWebSocket, key, { value: NativeWebSocket[key] });
  }

  // Plain assignment: if TikTok wraps WebSocket itself it captures our
  // constructor first, so the capture chain stays intact either way.
  window.WebSocket = ReaderWebSocket;

  post("capture-hooked", { page: location.href });
})();
