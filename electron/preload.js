const { contextBridge } = require("electron");

// Lets the web app know it is running inside the Windows app (no other powers are exposed).
contextBridge.exposeInMainWorld("socApp", { platform: "windows", local: true });
