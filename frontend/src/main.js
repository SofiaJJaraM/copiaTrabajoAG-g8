import "./style.css";

import { createApiClient } from "./api.js";
import { AUTH_STATES, createAuthController } from "./auth.js";
import {
  RESTAURANT_STATES,
  createRestaurantsController,
} from "./restaurants.js";
import { FEED_STATES, createFeedController } from "./feed.js";
import { REVIEW_FORM_STATES, createReviewFormController } from "./reviewForm.js";
import { saveFeedSnapshot, loadFeedSnapshot, clearFeedSnapshot } from "./offlineFeed.js";
import { registerServiceWorker } from "./pwa.js";
import { createConnectivityController } from "./connectivity.js";

const connectivityStatus = document.querySelector("#connectivity-status");
const apiStatus = document.querySelector("#api-status");
const checkApiButton = document.querySelector("#check-api");
const authCard = document.querySelector("#auth-card");
const authStatus = document.querySelector("#auth-status");
const authPanels = {
  [AUTH_STATES.LOADING]: document.querySelector("#auth-loading"),
  [AUTH_STATES.ANONYMOUS]: document.querySelector("#auth-anonymous"),
  [AUTH_STATES.AUTHENTICATED]: document.querySelector("#auth-authenticated"),
  [AUTH_STATES.UNAVAILABLE]: document.querySelector("#auth-unavailable"),
};
const loginForm = document.querySelector("#login-form");
const loginButton = loginForm.querySelector('button[type="submit"]');
const passwordInput = document.querySelector("#password");
const logoutButton = document.querySelector("#logout");
const retrySessionButton = document.querySelector("#retry-session");
const sessionName = document.querySelector("#session-name");
const sessionHandle = document.querySelector("#session-handle");
const sessionEmail = document.querySelector("#session-email");
const sessionExpiration = document.querySelector("#session-expiration");
const restaurantsCard = document.querySelector("#restaurants-card");
const restaurantsStatus = document.querySelector("#restaurants-status");
const restaurantsList = document.querySelector("#restaurants-list");
const retryRestaurantsButton = document.querySelector("#retry-restaurants");
const restaurantPanels = {
  [RESTAURANT_STATES.LOADING]: document.querySelector("#restaurants-loading"),
  [RESTAURANT_STATES.READY]: document.querySelector("#restaurants-ready"),
  [RESTAURANT_STATES.EMPTY]: document.querySelector("#restaurants-empty"),
  [RESTAURANT_STATES.ERROR]: document.querySelector("#restaurants-error"),
};
const reviewCard = document.querySelector("#review-card");
const reviewFormElement = document.querySelector("#review-form");
const reviewFieldset = document.querySelector("#review-fieldset");
const reviewStatus = document.querySelector("#review-status");
const reviewRestaurantSelect = document.querySelector("#review-restaurant");
const feedCard = document.querySelector("#feed-card");
const feedStatus = document.querySelector("#feed-status");
const feedList = document.querySelector("#feed-list");
const retryFeedButton = document.querySelector("#retry-feed");
const feedPanels = {
  [FEED_STATES.LOADING]: document.querySelector("#feed-loading"),
  [FEED_STATES.READY]: document.querySelector("#feed-ready"),
  [FEED_STATES.EMPTY]: document.querySelector("#feed-empty"),
  [FEED_STATES.ERROR]: document.querySelector("#feed-error"),
};
const currentOrigin = document.querySelector("#current-origin");

const api = createApiClient();
let isOnline = navigator.onLine;

currentOrigin.textContent = window.location.origin;

function showStatus(element, message, kind = "neutral") {
  element.textContent = message;
  element.dataset.kind = kind;
}

function formatExpiration(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Fecha de caducación no disponible";
  }
  return `${new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date)} (hora local)`;
}

function createRestaurantItem(restaurant) {
  const item = document.createElement("li");
  item.className = "restaurant-item";

  const article = document.createElement("article");
  const name = document.createElement("h3");
  name.textContent = restaurant.name;
  const address = document.createElement("address");
  address.textContent = restaurant.address;
  const styles = document.createElement("ul");
  styles.className = "cuisine-list";
  styles.setAttribute("aria-label", "Estilos de comida");

  for (const cuisine of restaurant.cuisine_styles) {
    const style = document.createElement("li");
    style.textContent = cuisine.name;
    styles.append(style);
  }

  article.append(name, address, styles);
  item.append(article);
  return item;
}

function formatOccurredAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function createFeedItem(activity) {
  const { review } = activity;
  const item = document.createElement("li");
  item.className = "feed-item";

  const article = document.createElement("article");

  const meta = document.createElement("p");
  meta.className = "feed-meta";
  meta.textContent = `${review.author.handle} · ${review.restaurant.name}`;

  const dish = document.createElement("h3");
  dish.textContent = review.dish_name;

  const photo = document.createElement("img");
  photo.src = review.photo.content_url;
  photo.alt = `Foto de ${review.dish_name}`;
  photo.loading = "lazy";
  photo.className = "feed-photo";

  const text = document.createElement("p");
  text.textContent = review.text;

  const time = document.createElement("time");
  time.dateTime = activity.occurred_at;
  time.textContent = formatOccurredAt(activity.occurred_at);

  article.append(meta, dish, photo, text, time);
  item.append(article);
  return item;
}

function renderFeed(state) {
  feedCard.dataset.state = state.status;
  feedCard.setAttribute("aria-busy", String(state.status === FEED_STATES.LOADING));
  for (const [name, panel] of Object.entries(feedPanels)) {
    panel.hidden = name !== state.status;
  }

  showStatus(feedStatus, state.message, state.kind);
  retryFeedButton.disabled = state.status === FEED_STATES.LOADING;
  feedList.replaceChildren();

  if (state.status === FEED_STATES.READY) {
    feedList.append(...state.items.map(createFeedItem));
  }

  if (
    (state.status === FEED_STATES.READY || state.status === FEED_STATES.EMPTY) &&
    auth.state.status === AUTH_STATES.AUTHENTICATED
  ) {
    saveFeedSnapshot({
      userId: auth.state.session.user.id,
      items: state.items ?? [],
    });
  }
}

async function showOfflineFeed() {
  const snapshot = await loadFeedSnapshot();
  if (!snapshot) {
    feedCard.hidden = true;
    return;
  }

  feedCard.hidden = false;
  feedCard.dataset.state = "offline";
  feedCard.setAttribute("aria-busy", "false");
  for (const panel of Object.values(feedPanels)) {
    panel.hidden = true;
  }
  feedPanels[FEED_STATES.READY].hidden = false;
  feedList.replaceChildren(...snapshot.items.map(createFeedItem));
  showStatus(
    feedStatus,
    `Sin conexión: mostrando tu copia guardada (actualizada ${formatOccurredAt(snapshot.updatedAt)}). Podría estar desactualizada.`,
    "error",
  );
}

function renderRestaurants(state) {
  restaurantsCard.dataset.state = state.status;
  restaurantsCard.setAttribute(
    "aria-busy",
    String(state.status === RESTAURANT_STATES.LOADING),
  );
  for (const [name, panel] of Object.entries(restaurantPanels)) {
    panel.hidden = name !== state.status;
  }

  showStatus(restaurantsStatus, state.message, state.kind);
  retryRestaurantsButton.disabled = state.status === RESTAURANT_STATES.LOADING;
  restaurantsList.replaceChildren();

  if (state.status === RESTAURANT_STATES.READY) {
    restaurantsList.append(...state.items.map(createRestaurantItem));
    reviewRestaurantSelect.replaceChildren(
      ...state.items.map((restaurant) => {
        const option = document.createElement("option");
        option.value = restaurant.id;
        option.textContent = restaurant.name;
        return option;
      }),
    );
  }
}

function renderReviewForm(state) {
  showStatus(reviewStatus, state.message, state.kind);
  reviewFieldset.disabled = !isOnline || state.status === REVIEW_FORM_STATES.SUBMITTING;

  if (state.status === REVIEW_FORM_STATES.SUCCESS) {
    reviewFormElement.reset();
  }
}

function renderAuth(state) {
  authCard.dataset.state = state.status;
  authCard.setAttribute("aria-busy", String(state.status === AUTH_STATES.LOADING));
  for (const [name, panel] of Object.entries(authPanels)) {
    panel.hidden = name !== state.status;
  }

  showStatus(authStatus, state.message, state.kind);
  updateAuthAvailability(state.status);

  if (state.status === AUTH_STATES.AUTHENTICATED) {
    sessionName.textContent = state.session.user.name;
    sessionHandle.textContent = state.session.user.handle;
    sessionEmail.textContent = state.session.user.email;
    sessionExpiration.dateTime = state.session.expires_at;
    sessionExpiration.textContent = formatExpiration(state.session.expires_at);
    restaurantsCard.hidden = false;
    restaurants.load();
    reviewCard.hidden = false;
    feedCard.hidden = false;
    feed.load();
  } else {
    restaurantsCard.hidden = true;
    restaurants.reset();
    reviewCard.hidden = true;
    reviewForm.reset();
    feed.reset();

    if (state.status === AUTH_STATES.ANONYMOUS) {
      feedCard.hidden = true;
      clearFeedSnapshot();
    } else if (state.status === AUTH_STATES.UNAVAILABLE) {
      showOfflineFeed();
    } else {
      feedCard.hidden = true;
    }
  }
}

let auth;
const restaurants = createRestaurantsController({
  api,
  onStateChange: renderRestaurants,
  onUnauthorized: () => auth.invalidateSession(),
});
const feed = createFeedController({
  api,
  onStateChange: renderFeed,
  onUnauthorized: () => auth.invalidateSession(),
});
const reviewForm = createReviewFormController({
  api,
  onStateChange: renderReviewForm,
  onCreated: () => feed.load(),
});
auth = createAuthController({ api, onStateChange: renderAuth });

async function checkApi() {
  checkApiButton.disabled = true;
  showStatus(apiStatus, "Consultando /healthz…");

  try {
    const payload = await api.health();
    showStatus(apiStatus, `API disponible: ${payload.status}`, "success");
  } catch (error) {
    showStatus(apiStatus, `No fue posible conectar: ${error.message}`, "error");
  } finally {
    checkApiButton.disabled = false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  await auth.login(Object.fromEntries(formData.entries()));
  if (auth.state.status === AUTH_STATES.AUTHENTICATED) {
    passwordInput.value = "";
  } else if (auth.state.status === AUTH_STATES.ANONYMOUS) {
    passwordInput.focus();
  }
});

reviewFormElement.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(reviewFormElement);
  reviewForm.submit(formData).catch(() => {});
});

logoutButton.addEventListener("click", () => auth.logout());
retrySessionButton.addEventListener("click", () => auth.restoreSession());
retryRestaurantsButton.addEventListener("click", () => restaurants.load());
retryFeedButton.addEventListener("click", () => feed.load());
checkApiButton.addEventListener("click", checkApi);

function updateAuthAvailability(status) {
  const busy = status === AUTH_STATES.LOADING;
  loginButton.disabled = busy || !isOnline;
  logoutButton.disabled = busy || !isOnline;
  retrySessionButton.disabled = busy || !isOnline;

  if (!isOnline && status === AUTH_STATES.ANONYMOUS) {
    showStatus(authStatus, "Sin conexión: no es posible iniciar sesión.", "error");
  }
}

function renderConnectivity(online) {
  isOnline = online;
  connectivityStatus.textContent = online
    ? "En línea"
    : "Sin conexión: el contenido podría estar desactualizado";
  connectivityStatus.dataset.kind = online ? "success" : "error";
  updateAuthAvailability(auth.state.status);
  reviewFieldset.disabled = !isOnline || reviewForm.state.status === REVIEW_FORM_STATES.SUBMITTING;
}

createConnectivityController({ onChange: renderConnectivity });
window.addEventListener("online", () => auth.restoreSession());

checkApi();
auth.restoreSession();
registerServiceWorker();
