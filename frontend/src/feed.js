import { ApiError } from "./api.js";

export const FEED_STATES = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  EMPTY: "empty",
  ERROR: "error",
});

const MESSAGES = Object.freeze({
  idle: "El feed se mostrará después de verificar la sesión.",
  loading: "Cargando la actividad reciente…",
  empty: "Todavía no hay actividad en tu feed.",
});

function readyMessage(count) {
  return count === 1
    ? "Se cargó 1 actividad desde el backend."
    : `Se cargaron ${count} actividades desde el backend.`;
}

function errorMessage(error) {
  if (error instanceof ApiError && error.kind === "network") {
    return "No fue posible conectar con el backend para cargar el feed.";
  }
  const status = error instanceof ApiError && error.status ? ` (HTTP ${error.status})` : "";
  return `No fue posible cargar el feed${status}. Vuelve a intentar.`;
}

function isUnauthorized(error) {
  return error instanceof ApiError && error.status === 401;
}

export function createFeedController({ api, onStateChange = () => {}, onUnauthorized = () => {} }) {
  let state;
  let requestVersion = 0;
  let activeRequest = null;

  function transition(status, details) {
    state = Object.freeze({ status, ...details });
    onStateChange(state);
    return state;
  }

  function reset() {
    requestVersion += 1;
    activeRequest?.abort();
    activeRequest = null;
    return transition(FEED_STATES.IDLE, {
      message: MESSAGES.idle,
      kind: "neutral",
    });
  }

  async function load() {
    requestVersion += 1;
    const version = requestVersion;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;

    transition(FEED_STATES.LOADING, {
      message: MESSAGES.loading,
      kind: "neutral",
    });

    try {
      const page = await api.feed({ signal: controller.signal });
      if (version !== requestVersion) {
        return state;
      }
      activeRequest = null;
      if (page.items.length === 0) {
        return transition(FEED_STATES.EMPTY, {
          items: Object.freeze([]),
          nextCursor: null,
          message: MESSAGES.empty,
          kind: "neutral",
        });
      }
      return transition(FEED_STATES.READY, {
        items: Object.freeze([...page.items]),
        nextCursor: page.next_cursor,
        message: readyMessage(page.items.length),
        kind: "success",
      });
    } catch (error) {
      if (version !== requestVersion) {
        return state;
      }
      activeRequest = null;
      if (isUnauthorized(error)) {
        reset();
        onUnauthorized(error);
        return state;
      }
      return transition(FEED_STATES.ERROR, {
        message: errorMessage(error),
        kind: "error",
      });
    }
  }

  reset();

  return Object.freeze({
    get state() {
      return state;
    },
    load,
    reset,
  });
}
