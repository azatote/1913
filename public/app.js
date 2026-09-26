const CARD_TOTAL = 56;
const CARD_WIDTH = 148;
const CARD_HEIGHT = 220;
const CARD_OFFSET = 0.35;
const MERGE_DISTANCE = 120;
const SNAP_DISTANCE = 28;
const DRAG_THRESHOLD = 6;
const ROW_MARGIN = 28;
const MIN_TABLE_ZOOM = 0.35;
const VISIBLE_PILE_LAYERS = 6;
const CARD_BACK_PATH = "carte_radio/dos.png";
const TAB_SESSION_KEY = "nandeck1913.session.tab";
const VIEWER_PLAYER_KEY = "nandeck1913.viewer.player";
const OPPONENT_HAND_HIDDEN_KEY = "nandeck1913.opponent.hand.hidden";
const SESSION_SAVE_DEBOUNCE_MS = 80;
const PLAYER_HEARTBEAT_INTERVAL_MS = 5000;
const SERVER_BOOTSTRAP_ENDPOINT = "/api/bootstrap";
const SERVER_SESSION_ENDPOINT = "/api/session";
const SERVER_RESET_ENDPOINT = "/api/reset";
const SERVER_PLAYER_RESERVE_ENDPOINT = "/api/player/reserve";
const SERVER_PLAYER_RELEASE_ENDPOINT = "/api/player/release";
const SERVER_PLAYER_HEARTBEAT_ENDPOINT = "/api/player/heartbeat";
const SERVER_EVENTS_ENDPOINT = "/api/events";

const board = document.getElementById("board");
const boardWrap = document.querySelector(".board-wrap");
const statusText = document.getElementById("statusText");
const serverIndicatorDot = document.getElementById("serverIndicatorDot");
const serverIndicatorText = document.getElementById("serverIndicatorText");
const syncIndicatorDot = document.getElementById("syncIndicatorDot");
const syncIndicatorText = document.getElementById("syncIndicatorText");
const playerChooser = document.getElementById("playerChooser");
const choosePlayerOneButton = document.getElementById("choosePlayerOneButton");
const choosePlayerTwoButton = document.getElementById("choosePlayerTwoButton");
const resetButton = document.getElementById("resetButton");
const completeResetButton = document.getElementById("completeResetButton");
const shuffleButton = document.getElementById("shuffleButton");
const sendToBottomHandButton = document.getElementById("sendToBottomHandButton");
const sendToTopHandButton = document.getElementById("sendToTopHandButton");
const viewerPlayerLabel = document.getElementById("viewerPlayerLabel");
const activePlayerLabel = document.getElementById("activePlayerLabel");
const toggleOpponentHandButton = document.getElementById("toggleOpponentHandButton");
const topHandZone = document.getElementById("topHandZone");
const bottomHandZone = document.getElementById("bottomHandZone");
const topHandTitle = document.getElementById("topHandTitle");
const bottomHandTitle = document.getElementById("bottomHandTitle");
const topHandCards = document.getElementById("topHandCards");
const bottomHandCards = document.getElementById("bottomHandCards");
const topHandMeta = document.getElementById("topHandMeta");
const bottomHandMeta = document.getElementById("bottomHandMeta");
const cardPreview = document.getElementById("cardPreview");
const cardPreviewBackdrop = document.getElementById("cardPreviewBackdrop");
const cardPreviewImage = document.getElementById("cardPreviewImage");

let piles = [];
let selectedPileId = null;
let highestZIndex = 1;
let dragState = null;
let handDragState = null;
let viewPanState = null;
let activePlayerId = "bottom";
let viewerPlayerId = null;
let tableZoom = 1;
let sessionRevision = 0;
let suppressSessionPersistence = false;
let syncIndicatorTimeoutId = null;
let isOpponentHandHidden = false;
let latestServerSessionState = null;
let playerAssignments = {
  top: null,
  bottom: null,
};
let serverEventSource = null;
let hasPendingSessionSave = false;
let sessionSaveTimeoutId = null;
let pileElements = new Map();
let boardRenderFrameId = null;
let sessionSaveInFlight = false;
let playerHeartbeatIntervalId = null;
let serverConnectionState = "connecting";
let hands = {
  top: [],
  bottom: [],
};

function generateId() {
  if (typeof crypto !== "undefined") {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    if (typeof crypto.getRandomValues === "function") {
      const buffer = new Uint8Array(16);
      crypto.getRandomValues(buffer);
      buffer[6] = (buffer[6] & 0x0f) | 0x40;
      buffer[8] = (buffer[8] & 0x3f) | 0x80;
      const hex = Array.from(buffer, (value) => value.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
    }
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function loadOrCreateSessionTabId() {
  try {
    const existingTabId = sessionStorage.getItem(TAB_SESSION_KEY);
    if (existingTabId) {
      return existingTabId;
    }

    const nextTabId = generateId();
    sessionStorage.setItem(TAB_SESSION_KEY, nextTabId);
    return nextTabId;
  } catch {
    return generateId();
  }
}

const sessionTabId = loadOrCreateSessionTabId();

const players = {
  top: {
    label: "Joueur 2",
    rowIndex: 0,
  },
  bottom: {
    label: "Joueur 1",
    rowIndex: 2,
  },
};

function isValidPlayerId(playerId) {
  return playerId === "top" || playerId === "bottom";
}

function getOpponentPlayerId(playerId) {
  return playerId === "top" ? "bottom" : "top";
}

function getViewerBottomPlayerId() {
  return viewerPlayerId ?? "bottom";
}

function getViewerTopPlayerId() {
  return getOpponentPlayerId(getViewerBottomPlayerId());
}

function isTopViewerPerspective() {
  return viewerPlayerId === "top";
}

function getDisplayPosition(modelX, modelY) {
  if (!isTopViewerPerspective()) {
    return { x: modelX, y: modelY };
  }

  return {
    x: board.clientWidth - CARD_WIDTH - modelX,
    y: board.clientHeight - CARD_HEIGHT - modelY,
  };
}

// The mirror transform is its own inverse.
function getModelPointerPosition(viewX, viewY) {
  return getDisplayPosition(viewX, viewY);
}

function getViewedRowIndex(rowIndex) {
  return isTopViewerPerspective() ? 2 - rowIndex : rowIndex;
}

function centerViewOnViewerSide() {
  if (!viewerPlayerId) {
    return;
  }

  const focusY = getRowYPositions()[players[viewerPlayerId].rowIndex];
  centerViewOnPosition({ x: getInitialDeckPosition().x, y: focusY });
}

function centerViewOnTableCenter() {
  centerViewOnPosition({
    x: Math.max(0, (board.clientWidth - CARD_WIDTH) / 2),
    y: Math.max(0, (board.clientHeight - CARD_HEIGHT) / 2),
  });
}

function applyRefreshViewport() {
  tableZoom = MIN_TABLE_ZOOM;
  applyTableZoom();
  centerViewOnTableCenter();
}

function setSyncIndicator(state, label) {
  if (!syncIndicatorDot || !syncIndicatorText) {
    return;
  }

  if (syncIndicatorText.textContent === label && syncIndicatorDot.classList.contains(`is-${state}`)) {
    return;
  }

  syncIndicatorDot.classList.remove("is-waiting", "is-syncing", "is-synced");
  syncIndicatorDot.classList.add(`is-${state}`);
  syncIndicatorText.textContent = label;
}

function setServerIndicator(state, label) {
  serverConnectionState = state;

  if (!serverIndicatorDot || !serverIndicatorText) {
    return;
  }

  if (serverIndicatorText.textContent === label && serverIndicatorDot.classList.contains(`is-${state}`)) {
    return;
  }

  serverIndicatorDot.classList.remove("is-connecting", "is-connected", "is-disconnected");
  serverIndicatorDot.classList.add(`is-${state}`);
  serverIndicatorText.textContent = label;
}

function queueSyncedIndicator() {
  if (syncIndicatorTimeoutId) {
    clearTimeout(syncIndicatorTimeoutId);
  }

  syncIndicatorTimeoutId = window.setTimeout(() => {
    setSyncIndicator("synced", "Synchronise");
    syncIndicatorTimeoutId = null;
  }, 250);
}

function createDeckCards() {
  return Array.from({ length: CARD_TOTAL }, (_, index) => ({
    id: generateId(),
    code: String(index + 1),
    faceUp: false,
  }));
}

function getCardFacePath(code) {
  return `carte_radio/carte (${code}).jpg`;
}

function getCardImagePath(card) {
  return card.faceUp ? getCardFacePath(card.code) : CARD_BACK_PATH;
}

function getTopCard(pile) {
  return pile.cards[pile.cards.length - 1] ?? null;
}

function isPileFaceUp(pile) {
  return Boolean(getTopCard(pile)?.faceUp);
}

function createPile(cards, x, y) {
  return {
    id: generateId(),
    cards,
    x,
    y,
    zIndex: highestZIndex++,
  };
}

function formatCardCount(count) {
  return `${count} carte${count > 1 ? "s" : ""}`;
}

function serializeCard(card) {
  return {
    id: card.id,
    code: card.code,
    faceUp: card.faceUp,
  };
}

function cloneCards(cards) {
  return (cards ?? []).map(serializeCard);
}

function serializePile(pile) {
  return {
    id: pile.id,
    x: pile.x,
    y: pile.y,
    zIndex: pile.zIndex,
    cards: cloneCards(pile.cards),
  };
}

function getSessionState() {
  return {
    piles: piles.map(serializePile),
    hands: {
      top: cloneCards(hands.top),
      bottom: cloneCards(hands.bottom),
    },
    selectedPileId,
    highestZIndex,
    activePlayerId,
    tableZoom,
    revision: sessionRevision,
    sourceTabId: sessionTabId,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function setPlayerAssignments(nextAssignments) {
  playerAssignments = sanitizePlayerAssignments(nextAssignments);
  updatePlayerChooserAvailability();
}

async function loadServerBootstrap() {
  try {
    const bootstrap = await fetchJson(SERVER_BOOTSTRAP_ENDPOINT, {
      method: "GET",
      headers: {},
    });

    latestServerSessionState = bootstrap?.sessionState ?? null;
    setPlayerAssignments(bootstrap?.playerAssignments);
    setServerIndicator("connected", "Serveur connecté. Partie synchronisée en temps réel.");
    return bootstrap;
  } catch {
    setServerIndicator("disconnected", "Serveur inaccessible. Vérifiez le Raspberry ou le réseau.");
    setSyncIndicator("waiting", "Connexion...");
    return {
      sessionState: null,
      playerAssignments: getEmptyPlayerAssignments(),
    };
  }
}

function scheduleSessionSave() {
  if (sessionSaveTimeoutId || sessionSaveInFlight || !hasPendingSessionSave) {
    return;
  }

  sessionSaveTimeoutId = window.setTimeout(() => {
    sessionSaveTimeoutId = null;
    void flushPendingSessionSave();
  }, SESSION_SAVE_DEBOUNCE_MS);
}

async function flushPendingSessionSave() {
  if (sessionSaveInFlight || !hasPendingSessionSave || !viewerPlayerId) {
    return;
  }

  sessionSaveInFlight = true;
  hasPendingSessionSave = false;
  // Snapshot taken at send time so rapid changes (drag, zoom) are serialized only once per request.
  const sessionState = getSessionState();
  latestServerSessionState = sessionState;

  try {
    await fetchJson(SERVER_SESSION_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ sessionState }),
    });
    setServerIndicator("connected", "Serveur connecté. Partie synchronisée en temps réel.");
    queueSyncedIndicator();
  } catch {
    setServerIndicator("disconnected", "Serveur inaccessible. Derniers changements non envoyés.");
    setSyncIndicator("waiting", "Connexion...");
  } finally {
    sessionSaveInFlight = false;
    if (hasPendingSessionSave) {
      scheduleSessionSave();
    }
  }
}

function cancelPendingSessionSave() {
  if (sessionSaveTimeoutId) {
    clearTimeout(sessionSaveTimeoutId);
    sessionSaveTimeoutId = null;
  }

  hasPendingSessionSave = false;
}

function saveSessionState() {
  if (suppressSessionPersistence || !viewerPlayerId) {
    return;
  }

  setSyncIndicator("syncing", "En attente");

  if (!hasPendingSessionSave) {
    sessionRevision += 1;
    hasPendingSessionSave = true;
  }

  scheduleSessionSave();
}

async function loadSessionState() {
  if (latestServerSessionState) {
    return latestServerSessionState;
  }

  const bootstrap = await loadServerBootstrap();
  return bootstrap.sessionState ?? null;
}

async function clearSessionState(clearAssignments = false) {
  try {
    const response = await fetchJson(SERVER_RESET_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ clearAssignments }),
      keepalive: clearAssignments,
    });
    setPlayerAssignments(response?.playerAssignments);
    latestServerSessionState = null;
  } catch {
    setSyncIndicator("waiting", "Connexion...");
  }
}

function clearViewerPlayer() {
  releaseViewerPlayerReservation();

  try {
    sessionStorage.removeItem(VIEWER_PLAYER_KEY);
  } catch {
  }

  viewerPlayerId = null;
  updateViewerStatus();
}

function saveViewerPlayer(playerId) {
  try {
    sessionStorage.setItem(VIEWER_PLAYER_KEY, playerId);
  } catch {
  }
}

function loadViewerPlayer() {
  try {
    const playerId = sessionStorage.getItem(VIEWER_PLAYER_KEY);
    return isValidPlayerId(playerId) ? playerId : null;
  } catch {
    return null;
  }
}

function getEmptyPlayerAssignments() {
  return {
    top: null,
    bottom: null,
  };
}

function sanitizePlayerAssignments(rawAssignments) {
  const assignments = getEmptyPlayerAssignments();

  if (!rawAssignments || typeof rawAssignments !== "object") {
    return assignments;
  }

  Object.keys(assignments).forEach((playerId) => {
    const ownerTabId = rawAssignments[playerId];
    assignments[playerId] = typeof ownerTabId === "string" && ownerTabId ? ownerTabId : null;
  });

  return assignments;
}

function loadPlayerAssignments() {
  return playerAssignments;
}

function getReservedPlayerIdForCurrentTab(assignments = loadPlayerAssignments()) {
  return Object.entries(assignments).find(([, ownerTabId]) => ownerTabId === sessionTabId)?.[0] ?? null;
}

async function reserveViewerPlayer(playerId) {
  if (!isValidPlayerId(playerId)) {
    return false;
  }

  try {
    const response = await fetchJson(SERVER_PLAYER_RESERVE_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ playerId, tabId: sessionTabId }),
    });
    setServerIndicator("connected", "Serveur connecté. Attribution des joueurs active.");
    setPlayerAssignments(response?.playerAssignments);
    return Boolean(response?.success);
  } catch {
    setServerIndicator("disconnected", "Serveur inaccessible. Attribution impossible pour le moment.");
    setSyncIndicator("waiting", "Connexion...");
    return false;
  }
}

function releaseViewerPlayerReservation({ keepalive = false } = {}) {
  void fetchJson(SERVER_PLAYER_RELEASE_ENDPOINT, {
    method: "POST",
    body: JSON.stringify({ tabId: sessionTabId }),
    keepalive,
  }).then((response) => {
    setServerIndicator("connected", "Serveur connecté. Attribution des joueurs active.");
    setPlayerAssignments(response?.playerAssignments);
  }).catch(() => {
  });
}

function getAutoAssignedViewerPlayerId() {
  const assignments = loadPlayerAssignments();
  const reservedPlayerId = getReservedPlayerIdForCurrentTab(assignments);

  if (reservedPlayerId) {
    return reservedPlayerId;
  }

  const availablePlayerIds = Object.keys(players).filter((playerId) => !assignments[playerId]);
  const occupiedPlayerIds = Object.keys(players).filter((playerId) => Boolean(assignments[playerId]));

  if (availablePlayerIds.length === 1 && occupiedPlayerIds.length === 1) {
    return availablePlayerIds[0];
  }

  return null;
}

function updatePlayerChooserAvailability() {
  const assignments = loadPlayerAssignments();
  const playerOneTaken = Boolean(assignments.bottom && assignments.bottom !== sessionTabId);
  const playerTwoTaken = Boolean(assignments.top && assignments.top !== sessionTabId);

  if (choosePlayerOneButton) {
    choosePlayerOneButton.disabled = playerOneTaken;
    choosePlayerOneButton.textContent = playerOneTaken ? "Joueur 1 deja pris" : "Joueur 1";
  }

  if (choosePlayerTwoButton) {
    choosePlayerTwoButton.disabled = playerTwoTaken;
    choosePlayerTwoButton.textContent = playerTwoTaken ? "Joueur 2 deja pris" : "Joueur 2";
  }
}

async function getInitialViewerPlayerId() {
  const savedViewerPlayerId = loadViewerPlayer();

  if (savedViewerPlayerId && await reserveViewerPlayer(savedViewerPlayerId)) {
    saveViewerPlayer(savedViewerPlayerId);
    return savedViewerPlayerId;
  }

  const autoAssignedPlayerId = getAutoAssignedViewerPlayerId();
  if (autoAssignedPlayerId && await reserveViewerPlayer(autoAssignedPlayerId)) {
    saveViewerPlayer(autoAssignedPlayerId);
    return autoAssignedPlayerId;
  }

  return null;
}

async function sendPlayerHeartbeat() {
  if (!viewerPlayerId) {
    return;
  }

  try {
    const response = await fetchJson(SERVER_PLAYER_HEARTBEAT_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        tabId: sessionTabId,
        playerId: viewerPlayerId,
      }),
    });
    setServerIndicator("connected", "Serveur connecté. Session multi-poste active.");
    setPlayerAssignments(response?.playerAssignments);
  } catch {
    setServerIndicator("disconnected", "Serveur inaccessible. Tentative de reconnexion…");
    setSyncIndicator("waiting", "Connexion...");
  }
}

function startPlayerHeartbeat() {
  if (playerHeartbeatIntervalId) {
    clearInterval(playerHeartbeatIntervalId);
  }

  if (!viewerPlayerId) {
    playerHeartbeatIntervalId = null;
    return;
  }

  playerHeartbeatIntervalId = window.setInterval(() => {
    void sendPlayerHeartbeat();
  }, PLAYER_HEARTBEAT_INTERVAL_MS);
}

function handleServerMessage(message) {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "player-assignments") {
    setPlayerAssignments(message.payload);

    if (!viewerPlayerId) {
      const autoAssignedPlayerId = getAutoAssignedViewerPlayerId();
      if (autoAssignedPlayerId) {
        void chooseViewerPlayer(autoAssignedPlayerId);
      }
    }

    return;
  }

  if (message.type === "session-state") {
    latestServerSessionState = message.payload ?? null;

    if (viewerPlayerId && message.payload) {
      restoreSessionState(message.payload);
    }

    return;
  }

  if (message.type === "complete-reset") {
    latestServerSessionState = null;
    setPlayerAssignments(message.payload?.playerAssignments);
    handleCompleteReset(true, Boolean(message.payload?.clearAssignments));
  }
}

function connectServerEvents() {
  if (serverEventSource) {
    serverEventSource.close();
  }

  serverEventSource = new EventSource(SERVER_EVENTS_ENDPOINT);
  serverEventSource.onmessage = (event) => {
    try {
      setServerIndicator("connected", "Serveur connecté. Mises à jour en direct reçues.");
      handleServerMessage(JSON.parse(event.data));
    } catch {
    }
  };
  serverEventSource.onerror = () => {
    setServerIndicator("disconnected", "Serveur déconnecté. Reconnexion automatique en cours.");
    setSyncIndicator("waiting", "Connexion...");
  };
}

function saveOpponentHandHidden(hidden) {
  try {
    sessionStorage.setItem(OPPONENT_HAND_HIDDEN_KEY, hidden ? "1" : "0");
  } catch {
  }
}

function loadOpponentHandHidden() {
  try {
    return sessionStorage.getItem(OPPONENT_HAND_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function applyOpponentHandVisibility() {
  document.body.classList.toggle("is-opponent-hand-hidden", isOpponentHandHidden);

  if (toggleOpponentHandButton) {
    toggleOpponentHandButton.textContent = isOpponentHandHidden ? "Afficher la main adverse" : "Masquer la main adverse";
    toggleOpponentHandButton.classList.toggle("is-active", isOpponentHandHidden);
  }
}

function toggleOpponentHandVisibility() {
  isOpponentHandHidden = !isOpponentHandHidden;
  saveOpponentHandHidden(isOpponentHandHidden);
  applyOpponentHandVisibility();
}

function updateViewerStatus() {
  document.body.classList.toggle("has-viewer-player", Boolean(viewerPlayerId));
  if (playerChooser) {
    playerChooser.hidden = Boolean(viewerPlayerId);
  }

  updatePlayerChooserAvailability();
  setSyncIndicator("waiting", "En attente");
}

async function chooseViewerPlayer(playerId) {
  if (!isValidPlayerId(playerId)) {
    return;
  }

  if (!await reserveViewerPlayer(playerId)) {
    updatePlayerChooserAvailability();
    updateStatus(`Le role ${players[playerId].label} est deja pris dans une autre session.`);
    return;
  }

  viewerPlayerId = playerId;
  saveViewerPlayer(playerId);
  updateViewerStatus();
  startPlayerHeartbeat();
  await initializeGame();
}

function updatePerspectiveLabels() {
  if (viewerPlayerLabel) {
    viewerPlayerLabel.textContent = `Joueur incarne: ${viewerPlayerId ? players[viewerPlayerId].label : "-"}`;
  }

  if (activePlayerLabel) {
    activePlayerLabel.textContent = viewerPlayerId ? "Jeu: libre depuis la main" : "Jeu: -";
  }

  if (topHandTitle) {
    topHandTitle.textContent = `Main de ${players[getViewerTopPlayerId()].label}`;
  }

  if (bottomHandTitle) {
    bottomHandTitle.textContent = `Main de ${players[getViewerBottomPlayerId()].label}`;
  }
}

function restoreSessionState(sessionState, options = {}) {
  const allowSameSource = options.allowSameSource === true;

  if (!sessionState?.piles || !sessionState?.hands) {
    return false;
  }

  if (!allowSameSource && sessionState.sourceTabId === sessionTabId) {
    return false;
  }

  if (typeof sessionState.revision === "number" && sessionState.revision <= sessionRevision) {
    return false;
  }

  suppressSessionPersistence = true;
  sessionRevision = typeof sessionState.revision === "number" ? sessionState.revision : sessionRevision;

  piles = sessionState.piles.map(serializePile);
  hands = {
    top: cloneCards(sessionState.hands.top),
    bottom: cloneCards(sessionState.hands.bottom),
  };
  selectedPileId = sessionState.selectedPileId;
  highestZIndex = sessionState.highestZIndex ?? 1;
  activePlayerId = sessionState.activePlayerId === "top" ? "top" : "bottom";
  tableZoom = typeof sessionState.tableZoom === "number" ? sessionState.tableZoom : 1;
  applyTableZoom();
  render();

  setSyncIndicator("synced", "Synchronise");
  suppressSessionPersistence = false;

  updateStatus("Session restaurée.");
  return true;
}

function getInitialDeckPosition() {
  const boardWidth = Math.max(board.clientWidth, CARD_WIDTH + 120);
  const rowPositions = getRowYPositions();
  return {
    x: Math.max(56, Math.round(boardWidth * 0.72) - Math.round(CARD_WIDTH / 2)),
    y: rowPositions[1],
  };
}

function resetGame() {
  const initialCards = createDeckCards();
  const initialDeckPosition = getInitialDeckPosition();
  piles = [createPile(initialCards, initialDeckPosition.x, initialDeckPosition.y)];
  hands = {
    top: [],
    bottom: [],
  };
  activePlayerId = "bottom";
  tableZoom = 1;
  applyTableZoom();
  selectedPileId = piles[0].id;
  centerViewOnPosition(initialDeckPosition);
  setSyncIndicator("syncing", "En attente");
  updateStatus("Nouvelle partie prête: 56 cartes dans le talon.");
  render();
}

function handleCompleteReset(isRemote = false, clearAssignments = true) {
  if (!isRemote) {
    void clearSessionState(clearAssignments);
  }

  cancelPendingSessionSave();
  sessionRevision = 0;
  piles = [];
  hands = {
    top: [],
    bottom: [],
  };
  selectedPileId = null;
  activePlayerId = "bottom";
  tableZoom = 1;
  applyTableZoom();

  if (playerHeartbeatIntervalId) {
    clearInterval(playerHeartbeatIntervalId);
    playerHeartbeatIntervalId = null;
  }

  if (clearAssignments) {
    clearViewerPlayer();
  }

  board.replaceChildren();
  pileElements = new Map();
  topHandCards.replaceChildren();
  bottomHandCards.replaceChildren();
  delete topHandCards.dataset.signature;
  delete bottomHandCards.dataset.signature;
  topHandMeta.textContent = "0 carte";
  bottomHandMeta.textContent = "0 carte";
  setSyncIndicator("waiting", "En attente");
  updateStatus("Reset complet effectué. Choisissez un joueur pour relancer une session.");
}

async function initializeGame(initialSessionState = null) {
  if (!viewerPlayerId) {
    return;
  }

  const sessionState = initialSessionState ?? await loadSessionState();
  if (restoreSessionState(sessionState, { allowSameSource: true })) {
    applyRefreshViewport();
    return;
  }

  resetGame();
  applyRefreshViewport();
}

function getSelectedPile() {
  return piles.find((pile) => pile.id === selectedPileId) ?? null;
}

function isCardPreviewOpen() {
  return Boolean(cardPreview && !cardPreview.hidden);
}

function closeCardPreview() {
  if (!cardPreview || !cardPreviewImage || cardPreview.hidden) {
    return;
  }

  cardPreview.hidden = true;
  cardPreview.setAttribute("aria-hidden", "true");
  cardPreviewImage.removeAttribute("src");
  cardPreviewImage.alt = "";
}

function openSelectedCardPreview() {
  const selectedPile = getSelectedPile();

  if (!selectedPile || selectedPile.cards.length === 0) {
    updateStatus("Sélectionnez un paquet avec une carte pour afficher l'aperçu.");
    return;
  }

  const topCard = getTopCard(selectedPile);
  if (!topCard || !cardPreview || !cardPreviewImage) {
    return;
  }

  cardPreviewImage.src = getCardImagePath(topCard);
  cardPreviewImage.alt = topCard.faceUp ? `Vue agrandie de la carte ${topCard.code}` : "Vue agrandie du dos de la carte";
  cardPreview.hidden = false;
  cardPreview.setAttribute("aria-hidden", "false");
}

function updateStatus(message) {
  statusText.textContent = message;
}

function centerViewOnPosition(position) {
  if (!boardWrap) {
    return;
  }

  const displayPosition = getDisplayPosition(position.x, position.y);

  boardWrap.scrollLeft = Math.max(0, displayPosition.x + CARD_WIDTH / 2 - boardWrap.clientWidth / 2);
  boardWrap.scrollTop = Math.max(0, displayPosition.y + CARD_HEIGHT / 2 - boardWrap.clientHeight / 2);
}

function getZoomOrigin() {
  const initialDeckPosition = getInitialDeckPosition();
  return {
    x: initialDeckPosition.x + CARD_WIDTH / 2,
    y: initialDeckPosition.y + CARD_HEIGHT / 2,
  };
}

function applyTableZoom() {
  if (!board) {
    return;
  }

  const origin = getZoomOrigin();
  board.style.transform = `scale(${tableZoom})`;
  board.style.transformOrigin = `${origin.x}px ${origin.y}px`;
}

function updateTableZoom(delta) {
  const nextZoom = Math.max(MIN_TABLE_ZOOM, Math.min(1, Number((tableZoom + delta).toFixed(2))));

  if (nextZoom === tableZoom) {
    return;
  }

  tableZoom = nextZoom;
  applyTableZoom();
  updateStatus(`Zoom de la table: ${Math.round(tableZoom * 100)}%.`);
  saveSessionState();
}

function setActivePlayer(playerId) {
  activePlayerId = playerId;
  updateStatus(`Joueur actif: ${players[playerId].label}. Vous incarnez ${players[viewerPlayerId].label}.`);
  render();
}

function clampPileToBoard(pile) {
  pile.x = Math.max(0, Math.min(pile.x, board.clientWidth - CARD_WIDTH));
  pile.y = Math.max(0, Math.min(pile.y, board.clientHeight - CARD_HEIGHT));
}

function getBoardPointerPosition(event) {
  const boardRect = board.getBoundingClientRect();
  const origin = getZoomOrigin();
  const relativeX = event.clientX - boardRect.left;
  const relativeY = event.clientY - boardRect.top;

  const viewX = (relativeX - origin.x * (1 - tableZoom)) / tableZoom;
  const viewY = (relativeY - origin.y * (1 - tableZoom)) / tableZoom;

  return getModelPointerPosition(viewX, viewY);
}

function getRowYPositions() {
  const boardHeight = Math.max(board.clientHeight, CARD_HEIGHT + ROW_MARGIN * 2);
  const topRow = ROW_MARGIN;
  const middleRow = Math.max(ROW_MARGIN, Math.round((boardHeight - CARD_HEIGHT) / 2));
  const bottomRow = Math.max(ROW_MARGIN, boardHeight - CARD_HEIGHT - ROW_MARGIN);
  return [topRow, middleRow, bottomRow];
}

function getNearestRowIndex(pile, rowPositions = getRowYPositions()) {
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  rowPositions.forEach((rowY, index) => {
    const distance = Math.abs(rowY - pile.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function snapPileToRow(pile) {
  const rowPositions = getRowYPositions();
  pile.y = rowPositions[getNearestRowIndex(pile, rowPositions)];
  clampPileToBoard(pile);
}

function snapPileVertically(pile) {
  if (!isPileFaceUp(pile)) {
    return false;
  }

  const rowPositions = getRowYPositions();
  const rowIndex = getNearestRowIndex(pile, rowPositions);

  const snapTarget = piles.find((candidate) => {
    if (candidate.id === pile.id || !isPileFaceUp(candidate)) {
      return false;
    }

    if (getNearestRowIndex(candidate, rowPositions) !== rowIndex) {
      return false;
    }

    return Math.abs(candidate.x - pile.x) <= SNAP_DISTANCE;
  });

  if (!snapTarget) {
    return false;
  }

  pile.x = snapTarget.x;
  clampPileToBoard(pile);
  return true;
}

function drawFromPile(sourcePile, count) {
  if (!sourcePile || sourcePile.cards.length === 0) {
    updateStatus("Aucune carte disponible à piocher.");
    return false;
  }

  const drawn = sourcePile.cards.splice(-count).reverse();
  drawn.forEach((card) => {
    card.faceUp = true;
  });

  const newPile = createPile(
    drawn,
    Math.min(sourcePile.x + 190, board.clientWidth - 160),
    Math.min(sourcePile.y + 20, board.clientHeight - 230),
  );
  snapPileToRow(newPile);

  piles.push(newPile);
  selectedPileId = newPile.id;

  if (sourcePile.cards.length === 0) {
    piles = piles.filter((pile) => pile.id !== sourcePile.id);
  }

  updateStatus(`${formatCardCount(drawn.length)} piochée${drawn.length > 1 ? "s" : ""}.`);
  render();
  return true;
}

function drawCards(count) {
  const sourcePile = getSelectedPile() ?? piles[0];
  drawFromPile(sourcePile, count);
}

function flipSelectedPile() {
  flipPile(getSelectedPile());
}

function flipPile(pile) {
  if (!pile || pile.cards.length === 0) {
    updateStatus("Sélectionnez un paquet avec au moins une carte.");
    return;
  }

  const topCard = getTopCard(pile);
  topCard.faceUp = !topCard.faceUp;
  snapPileVertically(pile);
  updateStatus(`Carte ${topCard.code} ${topCard.faceUp ? "retournée face visible" : "retournée face cachée"}.`);
  render();
}

function shuffleSelectedPile() {
  const selectedPile = getSelectedPile();

  if (!selectedPile || selectedPile.cards.length < 2) {
    updateStatus("Le paquet sélectionné doit contenir au moins 2 cartes pour être mélangé.");
    return;
  }

  for (let index = selectedPile.cards.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(Math.random() * (index + 1));
    [selectedPile.cards[index], selectedPile.cards[targetIndex]] = [selectedPile.cards[targetIndex], selectedPile.cards[index]];
  }

  updateStatus(`Paquet mélangé (${selectedPile.cards.length} cartes).`);
  render();
}

function selectPile(pileId) {
  selectedPileId = pileId;
  const pile = getSelectedPile();

  if (pile) {
    pile.zIndex = highestZIndex++;
    updateStatus(`Paquet sélectionné: ${formatCardCount(pile.cards.length)}.`);
  }

  render();
}

function mergePileIntoTarget(sourceId, targetId) {
  if (sourceId === targetId) {
    return;
  }

  const sourcePile = piles.find((pile) => pile.id === sourceId);
  const targetPile = piles.find((pile) => pile.id === targetId);

  if (!sourcePile || !targetPile) {
    return;
  }

  targetPile.cards.push(...sourcePile.cards);
  targetPile.zIndex = highestZIndex++;
  selectedPileId = targetPile.id;
  piles = piles.filter((pile) => pile.id !== sourcePile.id);
  updateStatus(`Paquets fusionnés: ${formatCardCount(targetPile.cards.length)} dans le nouveau paquet.`);
}

function getHandCards(playerId) {
  return hands[playerId];
}

function moveSelectedPileToHand(playerId) {
  const pile = getSelectedPile();

  if (!pile || pile.cards.length === 0) {
    updateStatus("Sélectionnez un paquet à envoyer dans une main.");
    return;
  }

  movePileToHand(pile.id, playerId);
}

function movePileToHand(pileId, playerId) {
  const pile = piles.find((entry) => entry.id === pileId);

  if (!pile || pile.cards.length === 0) {
    return false;
  }

  if (pile.cards.length > 1) {
    updateStatus("Impossible d'envoyer plusieurs cartes dans une main en une seule fois.");
    return false;
  }

  getHandCards(playerId).push(...pile.cards);
  piles = piles.filter((entry) => entry.id !== pile.id);
  selectedPileId = piles[0]?.id ?? null;
  updateStatus(`${formatCardCount(pile.cards.length)} envoyée${pile.cards.length > 1 ? "s" : ""} vers la main de ${players[playerId].label}.`);
  render();
  return true;
}

function getPlayPositionForPlayer(playerId) {
  const rowPositions = getRowYPositions();
  const rowIndex = players[playerId].rowIndex;
  const rowY = rowPositions[rowIndex];
  const rowPiles = piles
    .filter((pile) => getNearestRowIndex(pile, rowPositions) === rowIndex)
    .sort((left, right) => left.x - right.x);
  const nextX = rowPiles.length === 0 ? 56 : Math.min(rowPiles[rowPiles.length - 1].x + 42, Math.max(56, board.clientWidth - CARD_WIDTH - 24));

  return {
    x: nextX,
    y: rowY,
  };
}

function playCardFromHand(playerId, cardIndex, dropPosition = null) {
  if (viewerPlayerId !== playerId) {
    updateStatus(`Cette session incarne ${players[viewerPlayerId].label}.`);
    return;
  }

  const handCards = getHandCards(playerId);
  const [card] = handCards.splice(cardIndex, 1);

  if (!card) {
    return;
  }

  card.faceUp = true;
  const position = dropPosition ?? getPlayPositionForPlayer(playerId);
  const pile = createPile([card], position.x, position.y);
  clampPileToBoard(pile);
  snapPileToRow(pile);
  piles.push(pile);
  selectedPileId = pile.id;
  updateStatus(`Carte ${card.code} jouee depuis la main de ${players[playerId].label}.`);
  render();
}

function startHandDrag(playerId, cardIndex) {
  if (viewerPlayerId !== playerId) {
    return;
  }

  handDragState = {
    playerId,
    cardIndex,
  };
}

function clearHandDrag() {
  handDragState = null;
}

function moveHandCard(playerId, fromIndex, toIndex) {
  const handCards = getHandCards(playerId);

  if (!Array.isArray(handCards) || fromIndex === toIndex) {
    return false;
  }

  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= handCards.length
    || toIndex >= handCards.length
  ) {
    return false;
  }

  const [movedCard] = handCards.splice(fromIndex, 1);
  handCards.splice(toIndex, 0, movedCard);
  updateStatus(`Main de ${players[playerId].label} réorganisée.`);
  render();
  return true;
}

function reorderHandFromDrag(targetPlayerId, targetIndex) {
  if (!handDragState || handDragState.playerId !== targetPlayerId) {
    return false;
  }

  const moved = moveHandCard(targetPlayerId, handDragState.cardIndex, targetIndex);
  clearHandDrag();
  return moved;
}

function getHandDropPlayerIdFromPoint(clientX, clientY) {
  const targetElement = document.elementFromPoint(clientX, clientY);
  const handZone = targetElement?.closest(".hand-zone");
  const playerId = handZone?.dataset.playerId;

  return isValidPlayerId(playerId) ? playerId : null;
}

function startViewPan(event) {
  if (!boardWrap || event.button !== 0) {
    return;
  }

  if (event.target.closest(".pile, .hand-card")) {
    return;
  }

  viewPanState = {
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: boardWrap.scrollLeft,
    scrollTop: boardWrap.scrollTop,
  };
  boardWrap.classList.add("is-panning");
}

function moveViewPan(event) {
  if (!boardWrap || !viewPanState) {
    return;
  }

  const deltaX = event.clientX - viewPanState.startX;
  const deltaY = event.clientY - viewPanState.startY;
  boardWrap.scrollLeft = viewPanState.scrollLeft - deltaX;
  boardWrap.scrollTop = viewPanState.scrollTop - deltaY;
}

function stopViewPan() {
  if (!boardWrap || !viewPanState) {
    return;
  }

  viewPanState = null;
  boardWrap.classList.remove("is-panning");
}

function onBoardDragOver(event) {
  if (!handDragState) {
    return;
  }

  event.preventDefault();
}

function onBoardDrop(event) {
  if (!handDragState) {
    return;
  }

  event.preventDefault();
  const pointerPosition = getBoardPointerPosition(event);
  const dropPosition = {
    x: pointerPosition.x - CARD_WIDTH / 2,
    y: pointerPosition.y - CARD_HEIGHT / 2,
  };

  playCardFromHand(handDragState.playerId, handDragState.cardIndex, dropPosition);
  clearHandDrag();
}

function findMergeTarget(activePile) {
  return piles.find((candidate) => (
    candidate.id !== activePile.id
    && Math.hypot(activePile.x - candidate.x, activePile.y - candidate.y) < MERGE_DISTANCE
  ));
}

function startDrag(event, pileId) {
  const pile = piles.find((entry) => entry.id === pileId);

  if (!pile) {
    return;
  }

  const pointerPosition = getBoardPointerPosition(event);
  dragState = {
    pileId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: pointerPosition.x - pile.x,
    offsetY: pointerPosition.y - pile.y,
    moved: false,
  };

  selectPile(pileId);
}

function onPointerMove(event) {
  if (!dragState) {
    return;
  }

  const pointerPosition = getBoardPointerPosition(event);
  const pile = piles.find((entry) => entry.id === dragState.pileId);

  if (!pile) {
    dragState = null;
    return;
  }

  if (!dragState.moved) {
    const moveDistance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (moveDistance < DRAG_THRESHOLD) {
      return;
    }

    dragState.moved = true;
  }

  pile.x = pointerPosition.x - dragState.offsetX;
  pile.y = pointerPosition.y - dragState.offsetY;
  clampPileToBoard(pile);
  snapPileToRow(pile);
  snapPileVertically(pile);
  scheduleBoardRender();
}

function onPointerUp(event) {
  if (!dragState) {
    return;
  }

  if (event?.type === "pointerleave" && event.buttons !== 0) {
    return;
  }

  const releasedDragState = dragState;
  const pile = piles.find((entry) => entry.id === releasedDragState.pileId);
  dragState = null;

  if (!pile) {
    return;
  }

  if (!releasedDragState.moved) {
    selectedPileId = pile.id;

    if (!isPileFaceUp(pile)) {
      drawFromPile(pile, 1);
      return;
    }

    flipPile(pile);
    return;
  }

  if (event) {
    const handDropPlayerId = getHandDropPlayerIdFromPoint(event.clientX, event.clientY);

    if (handDropPlayerId) {
      movePileToHand(pile.id, handDropPlayerId);
      return;
    }
  }

  snapPileToRow(pile);
  snapPileVertically(pile);

  const mergeTarget = findMergeTarget(pile);
  if (mergeTarget) {
    mergePileIntoTarget(pile.id, mergeTarget.id);
    snapPileVertically(mergeTarget);
  }

  render();
}

function getPileSignature(pile) {
  const visibleCards = pile.cards.slice(-VISIBLE_PILE_LAYERS).map((card) => `${card.code}${card.faceUp ? "+" : "-"}`);
  return `${pile.cards.length}|${visibleCards.join(",")}`;
}

function updatePileElement(pileElement, pile, rowPositions) {
  const displayPosition = getDisplayPosition(pile.x, pile.y);
  pileElement.style.left = `${displayPosition.x}px`;
  pileElement.style.top = `${displayPosition.y}px`;
  pileElement.style.zIndex = String(pile.zIndex);
  pileElement.classList.toggle("is-selected", pile.id === selectedPileId);
  pileElement.classList.toggle("is-dragging", dragState?.pileId === pile.id);
  pileElement.classList.toggle("is-opponent-row", getViewedRowIndex(getNearestRowIndex(pile, rowPositions)) === 0);
}

function createPileElement(pile) {
  const pileElement = document.createElement("div");
  pileElement.className = "pile";

  const visibleCards = pile.cards.slice(-VISIBLE_PILE_LAYERS);
  visibleCards.forEach((card, index) => {
    const layer = document.createElement("div");
    layer.className = "card-layer";
    layer.style.transform = `translate(${index * CARD_OFFSET}px, ${index * CARD_OFFSET}px)`;

    const face = document.createElement("div");
    face.className = "card-face";

    const image = document.createElement("img");
    image.src = getCardImagePath(card);
    image.alt = card.faceUp ? `Carte ${card.code}` : "Dos de carte";
    image.draggable = false;

    face.appendChild(image);
    layer.appendChild(face);
    pileElement.appendChild(layer);
  });

  if (pile.cards.length > 1) {
    const pileCount = document.createElement("div");
    pileCount.className = "pile-count";
    pileCount.textContent = String(pile.cards.length);
    pileElement.appendChild(pileCount);
  }

  pileElement.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pileElement.setPointerCapture(event.pointerId);
    startDrag(event, pile.id);
  });

  pileElement.addEventListener("pointerup", (event) => {
    onPointerUp(event);
  });

  return pileElement;
}

// Reuses existing pile elements so dragging keeps pointer capture and avoids reloading images.
function renderBoard() {
  const rowPositions = getRowYPositions();
  const nextPileElements = new Map();
  const orderedElements = piles.map((pile) => {
    const signature = getPileSignature(pile);
    let entry = pileElements.get(pile.id);

    if (!entry || entry.signature !== signature) {
      entry = { element: createPileElement(pile), signature };
    }

    updatePileElement(entry.element, pile, rowPositions);
    nextPileElements.set(pile.id, entry);
    return entry.element;
  });

  pileElements = nextPileElements;

  const currentChildren = board.children;
  const isSameContent = currentChildren.length === orderedElements.length
    && orderedElements.every((element, index) => currentChildren[index] === element);

  if (!isSameContent) {
    board.replaceChildren(...orderedElements);
  }
}

function scheduleBoardRender() {
  if (boardRenderFrameId) {
    return;
  }

  boardRenderFrameId = requestAnimationFrame(() => {
    boardRenderFrameId = null;
    renderBoard();
    saveSessionState();
  });
}

function isHandDragFrom(playerId) {
  return handDragState?.playerId === playerId;
}

function createHandCardElement(playerId, card, index) {
  const isViewer = playerId === viewerPlayerId;
  const handCard = document.createElement("button");
  handCard.type = "button";
  handCard.className = `hand-card ${isViewer ? "is-visible" : "is-hidden"}`;
  handCard.draggable = isViewer;

  const image = document.createElement("img");
  image.src = isViewer ? getCardFacePath(card.code) : CARD_BACK_PATH;
  image.alt = isViewer ? `Carte ${card.code}` : "Carte cachée";

  handCard.appendChild(image);
  handCard.addEventListener("dblclick", () => {
    playCardFromHand(playerId, index);
  });
  handCard.addEventListener("dragstart", (event) => {
    startHandDrag(playerId, index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `${playerId}:${index}`);
    }
  });
  handCard.addEventListener("dragover", (event) => {
    if (!isHandDragFrom(playerId)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  });
  handCard.addEventListener("drop", (event) => {
    if (!isHandDragFrom(playerId)) {
      return;
    }

    event.preventDefault();
    reorderHandFromDrag(playerId, index);
  });
  handCard.addEventListener("dragend", () => {
    clearHandDrag();
  });

  return handCard;
}

function renderHand(playerId, zoneElement, cardsElement, metaElement) {
  const handCards = getHandCards(playerId);
  const isViewer = playerId === viewerPlayerId;

  zoneElement.dataset.playerId = playerId;
  zoneElement.classList.toggle("is-active", isViewer);
  zoneElement.classList.toggle("is-viewer", isViewer);
  metaElement.textContent = `${formatCardCount(handCards.length)}${isViewer ? " visible" : " cachée"}`;
  cardsElement.ondragover = null;
  cardsElement.ondrop = null;

  if (isViewer) {
    cardsElement.ondragover = (event) => {
      if (!isHandDragFrom(playerId)) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    };

    cardsElement.ondrop = (event) => {
      if (!isHandDragFrom(playerId)) {
        return;
      }

      event.preventDefault();
      const targetIndex = Math.max(0, getHandCards(playerId).length - 1);
      reorderHandFromDrag(playerId, targetIndex);
    };
  }

  const signature = `${playerId}|${isViewer}|${handCards.map((card) => card.code).join(",")}`;
  if (cardsElement.dataset.signature === signature) {
    return;
  }

  cardsElement.dataset.signature = signature;
  cardsElement.replaceChildren(...handCards.map((card, index) => createHandCardElement(playerId, card, index)));
}

function render() {
  if (boardRenderFrameId) {
    cancelAnimationFrame(boardRenderFrameId);
    boardRenderFrameId = null;
  }

  updatePerspectiveLabels();
  renderHand(getViewerTopPlayerId(), topHandZone, topHandCards, topHandMeta);
  renderHand(getViewerBottomPlayerId(), bottomHandZone, bottomHandCards, bottomHandMeta);
  renderBoard();
  saveSessionState();
}

async function bootstrapApplication() {
  connectServerEvents();
  setServerIndicator("connecting", "Connexion au serveur…");
  setSyncIndicator("waiting", "Connexion...");

  const bootstrap = await loadServerBootstrap();
  viewerPlayerId = await getInitialViewerPlayerId();
  isOpponentHandHidden = loadOpponentHandHidden();
  applyOpponentHandVisibility();
  updateViewerStatus();

  if (viewerPlayerId) {
    startPlayerHeartbeat();
    await initializeGame(bootstrap.sessionState ?? latestServerSessionState);
    return;
  }

  updateStatus("Choisissez un joueur pour rejoindre la partie.");
}

cardPreviewBackdrop?.addEventListener("click", closeCardPreview);

board.addEventListener("pointermove", onPointerMove);
board.addEventListener("pointerup", onPointerUp);
board.addEventListener("pointerleave", onPointerUp);
board.addEventListener("dragover", onBoardDragOver);
board.addEventListener("drop", onBoardDrop);
boardWrap?.addEventListener("pointerdown", startViewPan);
window.addEventListener("pointermove", moveViewPan);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointerup", stopViewPan);
window.addEventListener("pointercancel", stopViewPan);
boardWrap?.addEventListener("wheel", (event) => {
  event.preventDefault();
  updateTableZoom(event.deltaY < 0 ? 0.1 : -0.1);
}, { passive: false });

resetButton.addEventListener("click", resetGame);
completeResetButton?.addEventListener("click", () => handleCompleteReset(false));
shuffleButton.addEventListener("click", shuffleSelectedPile);
sendToBottomHandButton.addEventListener("click", () => moveSelectedPileToHand("bottom"));
sendToTopHandButton.addEventListener("click", () => moveSelectedPileToHand("top"));
choosePlayerOneButton?.addEventListener("click", () => {
  void chooseViewerPlayer("bottom");
});
choosePlayerTwoButton?.addEventListener("click", () => {
  void chooseViewerPlayer("top");
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    if (event.target instanceof HTMLElement && event.target.closest("button")) {
      return;
    }

    event.preventDefault();

    if (isCardPreviewOpen()) {
      closeCardPreview();
      return;
    }

    openSelectedCardPreview();
    return;
  }

  if (event.key === "Escape" && isCardPreviewOpen()) {
    closeCardPreview();
    return;
  }

  if (event.key.toLowerCase() === "f") {
    flipSelectedPile();
  }

  if (event.key.toLowerCase() === "d") {
    drawCards(1);
  }
});

window.addEventListener("beforeunload", () => {
  releaseViewerPlayerReservation({ keepalive: true });
});

toggleOpponentHandButton?.addEventListener("click", toggleOpponentHandVisibility);

void bootstrapApplication();