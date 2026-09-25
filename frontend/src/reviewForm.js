import { ApiError } from "./api.js";

export const REVIEW_FORM_STATES = Object.freeze({
  IDLE: "idle",
  SUBMITTING: "submitting",
  SUCCESS: "success",
  ERROR: "error",
});

const MESSAGES = Object.freeze({
  idle: "Completa el formulario para publicar una reseña.",
  submitting: "Enviando la reseña…",
  success: "¡Reseña publicada!",
});

function errorMessage(error) {
  if (error instanceof ApiError && error.kind === "network") {
    return "Se perdió la conexión mientras se enviaba. No fue posible completar la publicación.";
  }
  if (error instanceof ApiError) {
    const status = error.status ? ` (HTTP ${error.status})` : "";
    return `No fue posible publicar la reseña${status}: ${error.message}`;
  }
  return "No fue posible publicar la reseña.";
}

export function createReviewFormController({
  api,
  onStateChange = () => {},
  onCreated = () => {},
}) {
  let state;

  function transition(status, details) {
    state = Object.freeze({ status, ...details });
    onStateChange(state);
    return state;
  }

  function reset() {
    return transition(REVIEW_FORM_STATES.IDLE, {
      message: MESSAGES.idle,
      kind: "neutral",
    });
  }

  async function submit(formData) {
    transition(REVIEW_FORM_STATES.SUBMITTING, {
      message: MESSAGES.submitting,
      kind: "neutral",
    });
    try {
      const review = await api.createReview(formData);
      transition(REVIEW_FORM_STATES.SUCCESS, {
        message: MESSAGES.success,
        kind: "success",
      });
      onCreated(review);
      return review;
    } catch (error) {
      transition(REVIEW_FORM_STATES.ERROR, {
        message: errorMessage(error),
        kind: "error",
      });
      throw error;
    }
  }

  reset();

  return Object.freeze({
    get state() {
      return state;
    },
    submit,
    reset,
  });
}
