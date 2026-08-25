"use strict";

/*
 * ============================================================
 * NEXUSAI VERIFICATION FRONTEND
 * ============================================================
 *
 * Flow:
 *
 *   STEP 1
 *   Cloudflare Turnstile
 *        ↓
 *   STEP 2
 *   NexusAI challenge
 *        ↓
 *   STEP 3
 *   Discord OAuth
 *        ↓
 *   Verification complete
 *
 * IMPORTANT:
 * - Never put secrets in this file.
 * - API_BASE must point to your verification backend.
 * - Discord Client ID is public and may be used here.
 * ============================================================
 */

const CONFIG = {
  /*
   * Replace this with your real verification backend.
   *
   * Example:
   *
   * https://verification.nexusai.example
   */
  API_BASE:
    "https://YOUR-VERIFICATION-BACKEND.example.com",

  /*
   * Discord application CLIENT ID.
   *
   * This is safe to expose publicly.
   *
   * Do NOT put the Discord client secret here.
   */
  DISCORD_CLIENT_ID:
    "YOUR_DISCORD_CLIENT_ID"
};

/*
 * ============================================================
 * APPLICATION STATE
 * ============================================================
 */

let turnstileToken = null;

let verificationToken = null;

let currentChallenge = null;

let verificationStarted = false;

let challengePassed = false;

/*
 * ============================================================
 * DOM HELPERS
 * ============================================================
 */

function byId(id) {
  return document.getElementById(id);
}

function getSteps() {
  return Array.from(
    document.querySelectorAll(".step")
  );
}

function isConfigured() {
  return (
    CONFIG.API_BASE &&
    !CONFIG.API_BASE.includes("YOUR-") &&
    CONFIG.DISCORD_CLIENT_ID &&
    !CONFIG.DISCORD_CLIENT_ID.includes("YOUR_")
  );
}

/*
 * ============================================================
 * STEP MANAGEMENT
 * ============================================================
 */

function showStep(stepNumber) {
  const steps = getSteps();

  steps.forEach(step => {
    step.classList.remove("active");
  });

  const target =
    byId(`step-${stepNumber}`);

  if (target) {
    target.classList.add("active");
  }

  /*
   * Update progress indicator.
   */
  for (let i = 1; i <= 3; i++) {
    const progress =
      byId(`progress-${i}`);

    if (!progress) {
      continue;
    }

    progress.classList.remove(
      "active",
      "complete"
    );

    if (i < stepNumber) {
      progress.classList.add(
        "complete"
      );
    }

    if (i === stepNumber) {
      progress.classList.add(
        "active"
      );
    }
  }

  /*
   * Scroll back to the card smoothly on smaller screens.
   */
  const card =
    document.querySelector(
      ".verification-card"
    );

  if (card) {
    card.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}

function showSuccess() {
  getSteps().forEach(step => {
    step.classList.remove("active");
  });

  const success =
    byId("success");

  if (success) {
    success.classList.add(
      "active"
    );
  }

  document
    .querySelectorAll(
      ".progress-step"
    )
    .forEach(step => {
      step.classList.remove(
        "active"
      );

      step.classList.add(
        "complete"
      );
    });
}

function showFatalError(message) {
  getSteps().forEach(step => {
    step.classList.remove(
      "active"
    );
  });

  const errorStep =
    byId("fatal-error");

  if (errorStep) {
    errorStep.classList.add(
      "active"
    );
  }

  const messageElement =
    byId("fatal-error-message");

  if (messageElement) {
    messageElement.textContent =
      message ||
      "Verification failed.";
  }

  /*
   * Reset progress indicator.
   */
  document
    .querySelectorAll(
      ".progress-step"
    )
    .forEach(step => {
      step.classList.remove(
        "active"
      );
    });
}

/*
 * ============================================================
 * UI HELPERS
 * ============================================================
 */

function setButtonLoading(
  button,
  loading,
  loadingText = "Loading..."
) {
  if (!button) {
    return;
  }

  if (!button.dataset.originalText) {
    button.dataset.originalText =
      button.innerHTML;
  }

  if (loading) {
    button.disabled = true;

    button.innerHTML =
      `<span class="button-spinner"></span>${loadingText}`;
  } else {
    button.disabled = false;

    if (button.dataset.originalText) {
      button.innerHTML =
        button.dataset.originalText;
    }
  }
}

function setStatus(
  elementId,
  message,
  type = "normal"
) {
  const element =
    byId(elementId);

  if (!element) {
    return;
  }

  element.textContent =
    message || "";

  element.dataset.status =
    type;
}

function clearChallengeError() {
  const element =
    byId("challenge-error");

  if (element) {
    element.textContent = "";
  }
}

/*
 * ============================================================
 * API HELPER
 * ============================================================
 */

async function apiRequest(
  endpoint,
  options = {}
) {
  if (
    !CONFIG.API_BASE ||
    CONFIG.API_BASE.includes(
      "YOUR-VERIFICATION-BACKEND"
    )
  ) {
    throw new Error(
      "The verification backend has not been configured yet."
    );
  }

  const response =
    await fetch(
      `${CONFIG.API_BASE}${endpoint}`,
      {
        method:
          options.method || "GET",

        headers: {
          "Content-Type":
            "application/json",

          ...(options.headers || {})
        },

        body:
          options.body !== undefined
            ? JSON.stringify(
                options.body
              )
            : undefined,

        credentials:
          "omit"
      }
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Verification server returned HTTP ${response.status}.`
    );
  }

  if (
    data &&
    data.success === false
  ) {
    throw new Error(
      data.error ||
      "The verification request was rejected."
    );
  }

  return data;
}

/*
 * ============================================================
 * CLOUDFLARE TURNSTILE CALLBACKS
 * ============================================================
 *
 * These names intentionally live on window because they are
 * referenced from the HTML data-callback attributes.
 * ============================================================
 */

window.turnstileCompleted =
  function turnstileCompleted(
    token
  ) {
    turnstileToken =
      token || null;

    const button =
      byId(
        "continue-step-1"
      );

    if (button) {
      button.disabled =
        !Boolean(
          turnstileToken
        );
    }

    setStatus(
      "discord-status",
      ""
    );
  };

window.turnstileFailed =
  function turnstileFailed() {
    turnstileToken = null;

    const button =
      byId(
        "continue-step-1"
      );

    if (button) {
      button.disabled = true;
    }
  };

window.turnstileExpired =
  function turnstileExpired() {
    turnstileToken = null;

    const button =
      byId(
        "continue-step-1"
      );

    if (button) {
      button.disabled = true;
    }
  };

/*
 * ============================================================
 * STEP 1 — TURNSTILE
 * ============================================================
 */

async function startVerification() {
  const button =
    byId(
      "continue-step-1"
    );

  if (!turnstileToken) {
    return;
  }

  clearChallengeError();

  setButtonLoading(
    button,
    true,
    "Checking..."
  );

  try {
    const data =
      await apiRequest(
        "/api/verification/start",
        {
          method: "POST",

          body: {
            turnstileToken
          }
        }
      );

    if (
      !data?.verificationToken
    ) {
      throw new Error(
        "The verification server did not return a verification token."
      );
    }

    if (
      !data?.challenge
    ) {
      throw new Error(
        "The verification server did not return a challenge."
      );
    }

    verificationToken =
      data.verificationToken;

    currentChallenge =
      data.challenge;

    verificationStarted =
      true;

    challengePassed =
      false;

    renderChallenge(
      currentChallenge
    );

    /*
     * Turnstile tokens should not be reused for another
     * verification attempt.
     */
    turnstileToken = null;

    showStep(2);

  } catch (error) {
    showFatalError(
      error?.message ||
      "Unable to start verification."
    );
  } finally {
    /*
     * We only restore the normal button state when the user
     * remains on this step.
     */
    if (
      byId("step-1")?.classList.contains(
        "active"
      )
    ) {
      setButtonLoading(
        button,
        false
      );

      if (button) {
        button.disabled =
          !Boolean(
            turnstileToken
          );
      }
    }
  }
}

/*
 * ============================================================
 * STEP 2 — CHALLENGE RENDERING
 * ============================================================
 */

function renderChallenge(
  challenge
) {
  if (!challenge) {
    return;
  }

  const question =
    byId(
      "challenge-question"
    );

  if (question) {
    question.textContent =
      challenge.question ||
      "Complete the challenge.";
  }

  const input =
    byId(
      "challenge-answer"
    );

  if (input) {
    input.value = "";

    /*
     * Give focus once the step becomes visible.
     */
    setTimeout(() => {
      try {
        input.focus();
      } catch {
        // Ignore focus failures.
      }
    }, 100);
  }

  clearChallengeError();
}

/*
 * ============================================================
 * STEP 2 — SUBMIT CHALLENGE
 * ============================================================
 */

async function submitChallenge() {
  const input =
    byId(
      "challenge-answer"
    );

  const button =
    byId(
      "challenge-submit"
    );

  const answer =
    input?.value
      ?.trim() || "";

  clearChallengeError();

  if (!verificationStarted) {
    showFatalError(
      "Your verification session has not been started."
    );

    return;
  }

  if (!verificationToken) {
    showFatalError(
      "Your verification session has expired. Please restart."
    );

    return;
  }

  if (!answer) {
    const error =
      byId(
        "challenge-error"
      );

    if (error) {
      error.textContent =
        "Enter your answer first.";
    }

    if (input) {
      input.focus();
    }

    return;
  }

  setButtonLoading(
    button,
    true,
    "Checking..."
  );

  try {
    const data =
      await apiRequest(
        "/api/verification/challenge",
        {
          method: "POST",

          body: {
            verificationToken,
            answer
          }
        }
      );

    /*
     * Some backend implementations may return a refreshed
     * token after a successful challenge.
     */
    if (
      data?.verificationToken
    ) {
      verificationToken =
        data.verificationToken;
    }

    challengePassed =
      true;

    /*
     * Proceed to Discord connection.
     */
    showStep(3);

  } catch (error) {
    const message =
      error?.message ||
      "Incorrect answer.";

    const challengeError =
      byId(
        "challenge-error"
      );

    if (challengeError) {
      challengeError.textContent =
        message;
    }

    /*
     * If the backend generates a replacement challenge after
     * a wrong answer, render it.
     */
    if (
      error?.challenge
    ) {
      currentChallenge =
        error.challenge;

      renderChallenge(
        currentChallenge
      );
    }

  } finally {
    setButtonLoading(
      button,
      false
    );
  }
}

/*
 * ============================================================
 * STEP 3 — DISCORD OAUTH
 * ============================================================
 */

function buildDiscordOAuthUrl() {
  if (
    !verificationToken
  ) {
    throw new Error(
      "Your verification session has expired."
    );
  }

  if (
    !CONFIG.DISCORD_CLIENT_ID ||
    CONFIG.DISCORD_CLIENT_ID.includes(
      "YOUR_DISCORD_CLIENT_ID"
    )
  ) {
    throw new Error(
      "The Discord application Client ID has not been configured."
    );
  }

  /*
   * GitHub Pages URL:
   *
   * https://OPTIMIZERmax.github.io/
   *
   * Keep this derived from the current page so the same
   * frontend can work on GitHub Pages and localhost.
   */
  const redirectUri =
    `${window.location.origin}${window.location.pathname}`;

  /*
   * State contains no secret.
   *
   * The real verification token is included because your
   * backend should validate it again after Discord redirects
   * back to this page.
   */
  const statePayload = {
    verificationToken,
    timestamp:
      Date.now()
  };

  const encodedState =
    base64UrlEncode(
      JSON.stringify(
        statePayload
      )
    );

  const params =
    new URLSearchParams({
      client_id:
        CONFIG.DISCORD_CLIENT_ID,

      response_type:
        "code",

      redirect_uri:
        redirectUri,

      scope:
        "identify",

      state:
        encodedState
    });

  return (
    `https://discord.com/oauth2/authorize?` +
    params.toString()
  );
}

function base64UrlEncode(
  value
) {
  const bytes =
    new TextEncoder().encode(
      value
    );

  let binary = "";

  for (
    const byte of bytes
  ) {
    binary += String.fromCharCode(
      byte
    );
  }

  return btoa(binary)
    .replace(
      /\+/g,
      "-"
    )
    .replace(
      /\//g,
      "_"
    )
    .replace(
      /=+$/,
      ""
    );
}

function base64UrlDecode(
  value
) {
  let normalized =
    String(value)
      .replace(
        /-/g,
        "+"
      )
      .replace(
        /_/g,
        "/"
      );

  while (
    normalized.length % 4 !== 0
  ) {
    normalized += "=";
  }

  const binary =
    atob(normalized);

  const bytes =
    Uint8Array.from(
      binary,
      char =>
        char.charCodeAt(0)
    );

  return new TextDecoder()
    .decode(bytes);
}

/*
 * ============================================================
 * STEP 3 — CLICK DISCORD
 * ============================================================
 */

function connectDiscord() {
  if (!verificationStarted) {
    showFatalError(
      "Please start verification first."
    );

    return;
  }

  if (!challengePassed) {
    showFatalError(
      "Please complete the NexusAI challenge first."
    );

    return;
  }

  try {
    const url =
      buildDiscordOAuthUrl();

    window.location.href =
      url;

  } catch (error) {
    setStatus(
      "discord-status",
      error?.message ||
      "Unable to connect Discord.",
      "error"
    );
  }
}

/*
 * ============================================================
 * DISCORD CALLBACK
 * ============================================================
 */

async function handleDiscordCallback() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const code =
    params.get("code");

  const state =
    params.get("state");

  const oauthError =
    params.get("error");

  /*
   * Nothing to process.
   */
  if (
    !code &&
    !oauthError
  ) {
    return;
  }

  /*
   * User denied Discord authorization.
   */
  if (oauthError) {
    showFatalError(
      "Discord authorization was cancelled."
    );

    cleanOAuthUrl();

    return;
  }

  if (!code || !state) {
    showFatalError(
      "The Discord verification callback was incomplete."
    );

    cleanOAuthUrl();

    return;
  }

  showStep(3);

  setStatus(
    "discord-status",
    "Completing Discord verification..."
  );

  try {
    /*
     * Decode the state locally only so the frontend can
     * preserve/display its own session information.
     *
     * The backend MUST independently validate the state
     * and verification token.
     */
    let decodedState;

    try {
      decodedState =
        JSON.parse(
          base64UrlDecode(
            state
          )
        );
    } catch {
      throw new Error(
        "Invalid Discord verification state."
      );
    }

    if (
      !decodedState?.verificationToken
    ) {
      throw new Error(
        "The Discord verification session is invalid."
      );
    }

    const data =
      await apiRequest(
        "/api/verification/discord",
        {
          method: "POST",

          body: {
            code,
            state
          }
        }
      );

    /*
     * If the backend returns explicit success=false,
     * apiRequest() will already have thrown.
     */
    if (
      data?.verified !== undefined &&
      !data.verified
    ) {
      throw new Error(
        data.error ||
        "Discord verification was not completed."
      );
    }

    cleanOAuthUrl();

    showSuccess();

  } catch (error) {
    cleanOAuthUrl();

    showFatalError(
      error?.message ||
      "Discord verification failed."
    );
  }
}

/*
 * ============================================================
 * CLEAN OAUTH QUERY STRING
 * ============================================================
 */

function cleanOAuthUrl() {
  try {
    const cleanUrl =
      `${window.location.origin}${window.location.pathname}`;

    window.history.replaceState(
      {},
      document.title,
      cleanUrl
    );
  } catch {
    // Ignore history API failures.
  }
}

/*
 * ============================================================
 * EVENT WIRING
 * ============================================================
 */

function setupEventListeners() {
  const continueButton =
    byId(
      "continue-step-1"
    );

  if (continueButton) {
    continueButton.addEventListener(
      "click",
      startVerification
    );
  }

  const challengeButton =
    byId(
      "challenge-submit"
    );

  if (challengeButton) {
    challengeButton.addEventListener(
      "click",
      submitChallenge
    );
  }

  const challengeInput =
    byId(
      "challenge-answer"
    );

  if (challengeInput) {
    challengeInput.addEventListener(
      "keydown",
      event => {
        if (
          event.key === "Enter"
        ) {
          event.preventDefault();

          submitChallenge();
        }
      }
    );
  }

  const discordButton =
    byId(
      "discord-login"
    );

  if (discordButton) {
    discordButton.addEventListener(
      "click",
      connectDiscord
    );
  }
}

/*
 * ============================================================
 * INITIALIZATION
 * ============================================================
 */

function initialize() {
  setupEventListeners();

  /*
   * We deliberately do not block the page if the backend isn't
   * configured yet because you may be working on the frontend
   * first.
   */
  if (!isConfigured()) {
    console.warn(
      "[NexusAI] Verification backend or Discord Client ID has not been configured yet."
    );
  }

  /*
   * Check whether the page was opened from Discord OAuth.
   */
  handleDiscordCallback()
    .catch(error => {
      console.error(
        "[NexusAI] OAuth callback handling failed:",
        error
      );

      showFatalError(
        error?.message ||
        "Discord verification failed."
      );
    });
}

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initialize
  );
} else {
  initialize();
}
