// TokFlow tray app: runs the local engine in the background with a system
// tray icon. No windows — the dashboard opens in the default browser.
import { app, Tray, Menu, shell, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_URL = "http://127.0.0.1:24880/";

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Keep writable state (settings, profiles) in %APPDATA%\TokFlow, because the
  // install directory is read-only once packaged.
  process.env.TOKFLOW_DATA_DIR ||= path.join(app.getPath("userData"), "data");

  let tray = null;

  app.on("second-instance", () => shell.openExternal(DASHBOARD_URL));
  app.on("window-all-closed", () => { /* stay alive in the tray */ });

  app.whenReady().then(async () => {
    await import("../src/server.js"); // starts the engine on 127.0.0.1:24880

    const icon = nativeImage.createFromPath(path.join(here, "..", "extension", "icons", "icon32.png"));
    tray = new Tray(icon);
    tray.setToolTip("TokFlow — TikTok LIVE data engine");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Open dashboard", click: () => shell.openExternal(DASHBOARD_URL) },
      { label: "Open extension folder", click: () => shell.openPath(path.join(here, "..", "extension")) },
      { type: "separator" },
      {
        label: "Start when Windows starts",
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
      },
      { type: "separator" },
      { label: "Quit TokFlow", click: () => app.quit() }
    ]));
    tray.on("click", () => shell.openExternal(DASHBOARD_URL));

    if (!app.getLoginItemSettings().wasOpenedAtLogin) shell.openExternal(DASHBOARD_URL);
  });
}
