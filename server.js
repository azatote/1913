const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8765);
const PLAYER_TIMEOUT_MS = 15000;
const HEARTBEAT_GRACE_MS = 5000;
const PERSIST_DELAY_MS = 1000;
const STORE_FILE_PATH = path.join(__dirname, "session-store.json");
const STORE_TEMP_FILE_PATH = `${STORE_FILE_PATH}.tmp`;
const STATIC_ROOT = __dirname;
const PUBLIC_FILES = new Set(["index.html", "app.js", "styles.css"]);
const PUBLIC_DIRECTORIES = ["carte_radio/"];
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".svg", ".webp"]);

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
};

function createEmptyAssignments() {
  return {
    top: null,
    bottom: null,
  };
}

function loadPersistedSessionState() {
  try {
    if (!fs.existsSync(STORE_FILE_PATH)) {
      return null;
    }

    const rawStore = fs.readFileSync(STORE_FILE_PATH, "utf8");
    const parsedStore = JSON.parse(rawStore);
    return (parsedStore && parsedStore.sessionState) || null;
  } catch {
    return null;
  }
}

const store = {
  sessionState: loadPersistedSessionState(),
  playerAssignments: createEmptyAssignments(),
};

const eventClients = new Set();
let persistTimeoutId = null;
let persistInFlight = false;
let persistRequested = false;

function serializeStore() {
  return JSON.stringify({ sessionState: store.sessionState });
}

// Debounced + atomic (tmp then rename) to limit SD card writes and avoid corrupted files.
function schedulePersist() {
  persistRequested = true;

  if (persistTimeoutId || persistInFlight) {
    return;
  }

  persistTimeoutId = setTimeout(persistSessionState, PERSIST_DELAY_MS);
}

async function persistSessionState() {
  persistTimeoutId = null;
  persistInFlight = true;
  persistRequested = false;

  try {
    await fs.promises.writeFile(STORE_TEMP_FILE_PATH, serializeStore());
    await fs.promises.rename(STORE_TEMP_FILE_PATH, STORE_FILE_PATH);
  } catch (error) {
    console.error("Impossible de persister la session:", error);
  } finally {
    persistInFlight = false;
    if (persistRequested) {
      schedulePersist();
    }
  }
}

function persistSessionStateSync() {
  try {
    fs.writeFileSync(STORE_FILE_PATH, serializeStore());
  } catch (error) {
    console.error("Impossible de persister la session:", error);
  }
}

function toClientAssignments() {
  return {
    top: (store.playerAssignments.top && store.playerAssignments.top.tabId) || null,
    bottom: (store.playerAssignments.bottom && store.playerAssignments.bottom.tabId) || null,
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

function isValidPlayerId(playerId) {
  return playerId === "top" || playerId === "bottom";
}

function isValidTabId(tabId) {
  return typeof tabId === "string" && tabId.length > 0;
}

function broadcast(message) {
  const serializedMessage = `data: ${JSON.stringify(message)}\n\n`;
  for (const client of eventClients) {
    client.write(serializedMessage);
  }
}

function cleanupStaleAssignments() {
  const now = Date.now();
  let changed = false;

  Object.keys(store.playerAssignments).forEach((playerId) => {
    const assignment = store.playerAssignments[playerId];
    if (!assignment) {
      return;
    }

    if (now - assignment.updatedAt > PLAYER_TIMEOUT_MS + HEARTBEAT_GRACE_MS) {
      store.playerAssignments[playerId] = null;
      changed = true;
    }
  });

  if (changed) {
    broadcast({ type: "player-assignments", payload: toClientAssignments() });
  }
}

function releaseAssignmentsForTab(tabId) {
  let changed = false;

  Object.keys(store.playerAssignments).forEach((playerId) => {
    if (store.playerAssignments[playerId] && store.playerAssignments[playerId].tabId === tabId) {
      store.playerAssignments[playerId] = null;
      changed = true;
    }
  });

  return changed;
}

function reservePlayer(playerId, tabId) {
  cleanupStaleAssignments();

  const currentAssignment = store.playerAssignments[playerId];
  if (currentAssignment && currentAssignment.tabId !== tabId) {
    return false;
  }

  releaseAssignmentsForTab(tabId);
  store.playerAssignments[playerId] = {
    tabId,
    updatedAt: Date.now(),
  };
  return true;
}

function updateAssignmentHeartbeat(tabId, playerId) {
  cleanupStaleAssignments();

  const assignment = store.playerAssignments[playerId];
  if (!assignment || assignment.tabId !== tabId) {
    return false;
  }

  assignment.updatedAt = Date.now();
  return true;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    request.on("error", reject);
  });
}

function isPublicFile(relativePath) {
  return PUBLIC_FILES.has(relativePath) || PUBLIC_DIRECTORIES.some((directory) => relativePath.startsWith(directory));
}

function serveStaticFile(requestPath, response) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    sendText(response, 400, "Bad request");
    return;
  }

  const normalizedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const absolutePath = path.resolve(STATIC_ROOT, `.${normalizedPath}`);
  const relativePath = path.relative(STATIC_ROOT, absolutePath).split(path.sep).join("/");

  // Allow-list: never expose server.js, session-store.json, service files, backups...
  if (!isPublicFile(relativePath)) {
    sendText(response, 404, "Not found");
    return;
  }

  fs.readFile(absolutePath, (error, content) => {
    if (error) {
      sendText(response, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const extension = path.extname(absolutePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream",
      "Cache-Control": IMAGE_EXTENSIONS.has(extension) ? "public, max-age=86400" : "no-cache",
    });
    response.end(content);
  });
}

function handleBootstrap(response) {
  cleanupStaleAssignments();
  sendJson(response, 200, {
    sessionState: store.sessionState,
    playerAssignments: toClientAssignments(),
  });
}

async function handleSessionUpdate(request, response) {
  const payload = await readRequestBody(request);
  store.sessionState = (payload && payload.sessionState) || null;
  schedulePersist();
  broadcast({ type: "session-state", payload: store.sessionState });
  sendJson(response, 200, { ok: true });
}

async function handleReset(request, response) {
  const payload = await readRequestBody(request);
  store.sessionState = null;

  if (payload && payload.clearAssignments) {
    store.playerAssignments = createEmptyAssignments();
  }

  schedulePersist();
  broadcast({
    type: "complete-reset",
    payload: {
      clearAssignments: Boolean(payload && payload.clearAssignments),
      playerAssignments: toClientAssignments(),
    },
  });
  sendJson(response, 200, { ok: true, playerAssignments: toClientAssignments() });
}

async function handleReservePlayer(request, response) {
  const payload = await readRequestBody(request);
  const playerId = payload && payload.playerId;
  const tabId = payload && payload.tabId;

  if (!isValidPlayerId(playerId) || !isValidTabId(tabId)) {
    sendJson(response, 400, { success: false, message: "Paramètres invalides", playerAssignments: toClientAssignments() });
    return;
  }

  const success = reservePlayer(playerId, tabId);
  if (success) {
    broadcast({ type: "player-assignments", payload: toClientAssignments() });
  }

  sendJson(response, success ? 200 : 409, {
    success,
    playerAssignments: toClientAssignments(),
  });
}

async function handleReleasePlayer(request, response) {
  const payload = await readRequestBody(request);
  const tabId = payload && payload.tabId;

  if (!isValidTabId(tabId)) {
    sendJson(response, 400, { ok: false, playerAssignments: toClientAssignments() });
    return;
  }

  if (releaseAssignmentsForTab(tabId)) {
    broadcast({ type: "player-assignments", payload: toClientAssignments() });
  }

  sendJson(response, 200, { ok: true, playerAssignments: toClientAssignments() });
}

async function handleHeartbeat(request, response) {
  const payload = await readRequestBody(request);
  const tabId = payload && payload.tabId;
  const playerId = payload && payload.playerId;

  if (!isValidTabId(tabId) || !isValidPlayerId(playerId)) {
    sendJson(response, 400, { ok: false, playerAssignments: toClientAssignments() });
    return;
  }

  updateAssignmentHeartbeat(tabId, playerId);
  sendJson(response, 200, { ok: true, playerAssignments: toClientAssignments() });
}

function handleEvents(request, response) {
  cleanupStaleAssignments();
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  response.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  eventClients.add(response);

  request.on("close", () => {
    eventClients.delete(response);
  });
}

const ROUTES = {
  "GET /api/bootstrap": (request, response) => handleBootstrap(response),
  "GET /api/events": handleEvents,
  "POST /api/session": handleSessionUpdate,
  "POST /api/reset": handleReset,
  "POST /api/player/reserve": handleReservePlayer,
  "POST /api/player/release": handleReleasePlayer,
  "POST /api/player/heartbeat": handleHeartbeat,
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const routeHandler = ROUTES[`${request.method} ${url.pathname}`];

    if (routeHandler) {
      await routeHandler(request, response);
      return;
    }

    serveStaticFile(url.pathname, response);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendJson(response, 500, { ok: false, message: "Internal server error" });
    }
  }
});

setInterval(cleanupStaleAssignments, 5000);

function shutdown() {
  clearTimeout(persistTimeoutId);
  persistSessionStateSync();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, HOST, () => {
  console.log(`NanDeck 1913 disponible sur http://${HOST}:${PORT}`);
});