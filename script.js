const CONFIG = {
  /*
   * Your public backend URL.
   *
   * Example:
   *
   * https://nexusai-verification.your-worker.workers.dev
   */
  API_BASE:
    "https://YOUR-VERIFICATION-BACKEND.example.com",

  /*
   * This is NOT a secret.
   * It identifies your Discord application.
   */
  DISCORD_CLIENT_ID:
    "YOUR_DISCORD_CLIENT_ID"
};

let turnstileToken = null;
let verificationToken = null;

let currentChallenge = null;

/* =========================================================
 * HELPERS
 * ========================================================= */

function byId(id) {
  return document.getElementById(id);
}

function showStep(number) {
  document
    .querySelectorAll(".verification-step")
    .forEach(step => {
      step.classList.remove("active");
    });

  const target = byId(`step-${number}`);

  if (target) {
    target.classList.add("active");
  }

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

    if (i < number) {
      progress.classList.add("complete");
    }

    if (i === number) {
      progress.classList.add("active");
    }
  }
}

function showSuccess() {
  document
    .querySelectorAll(".verification-step")
    .forEach(step => {
      step.classList.remove("active");
    });

  byId("success")
    .classList.add("active");

  document
    .querySelectorAll(".progress-step")
    .forEach(step => {
      step.classList.remove("active");

      step.classList.add("complete");
    });
}

function showFatalError(message) {
  document
    .querySelectorAll(".verification-step")
    .forEach(step => {
      step.classList.remove("active");
    });

  byId("fatal-error")
    .classList.add("active");

  byId("fatal-error-message")
    .textContent =
    message ||
    "Verification failed.";
}

/* =========================================================
 * TURNSTILE
 * ========================================================= */

window.turnstileCompleted = function(token) {
  turnstileToken = token;

  const button =
    byId("continue-step-1");

  button.disabled = false;
};

window.turnstileFailed = function() {
  turnstileToken = null;

  byId("continue-step-1")
    .disabled = true;
};

window.turnstileExpired = function() {
  turnstileToken = null;

  byId("continue-step-1")
    .disabled = true;
};

/* =========================================================
 * STEP 1 -> STEP 2
 * ========================================================= */

byId("continue-step-1")
  .addEventListener(
    "click",
    async () => {

      if (!turnstileToken) {
        return;
      }

      const button =
        byId("continue-step-1");

      button.disabled = true;

      try {
        const response =
          await fetch(
            `${CONFIG.API_BASE}/api/verification/start`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body: JSON.stringify({
                turnstileToken
              })
            }
          );

        const data =
          await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ||
            "Unable to start verification."
          );
        }

        verificationToken =
          data.verificationToken;

        currentChallenge =
          data.challenge;

        byId(
          "challenge-question"
        ).textContent =
          currentChallenge.question;

        byId(
          "challenge-answer"
        ).value = "";

        byId(
          "challenge-error"
        ).textContent = "";

        showStep(2);

      } catch (error) {

        showFatalError(
          error.message
        );
      } finally {
        button.disabled =
          false;
      }
    }
  );

/* =========================================================
 * STEP 2
 * ========================================================= */

byId("challenge-submit")
  .addEventListener(
    "click",
    async () => {

      const answer =
        byId(
          "challenge-answer"
        ).value.trim();

      const errorElement =
        byId(
          "challenge-error"
        );

      errorElement.textContent = "";

      if (!answer) {
        errorElement.textContent =
          "Enter an answer first.";

        return;
      }

      const button =
        byId("challenge-submit");

      button.disabled = true;

      try {

        const response =
          await fetch(
            `${CONFIG.API_BASE}/api/verification/challenge`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body: JSON.stringify({
                verificationToken,
                answer
              })
            }
          );

        const data =
          await response.json();

        if (!response.ok || !data.success) {

          errorElement.textContent =
            data.error ||
            "Incorrect answer.";

          if (data.challenge) {
            currentChallenge =
              data.challenge;

            byId(
              "challenge-question"
            ).textContent =
              data.challenge.question;
          }

          return;
        }

        verificationToken =
          data.verificationToken;

        showStep(3);

      } catch (error) {

        errorElement.textContent =
          "Unable to contact the verification server.";

      } finally {

        button.disabled = false;
      }
    }
  );

/* =========================================================
 * STEP 3 — DISCORD OAUTH
 * ========================================================= */

byId("discord-login")
  .addEventListener(
    "click",
    () => {

      if (!verificationToken) {
        return;
      }

      const redirectUri =
        `${window.location.origin}${window.location.pathname}`;

      const state =
        btoa(
          JSON.stringify({
            verificationToken,
            timestamp: Date.now()
          })
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

          state
        });

      window.location.href =
        `https://discord.com/oauth2/authorize?${params.toString()}`;
    }
  );

/* =========================================================
 * DISCORD CALLBACK
 * ========================================================= */

async function handleDiscordCallback() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const code =
    params.get("code");

  const state =
    params.get("state");

  if (!code || !state) {
    return;
  }

  byId(
    "discord-status"
  ).textContent =
    "Completing Discord verification...";

  try {

    const response =
      await fetch(
        `${CONFIG.API_BASE}/api/verification/discord`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            code,
            state
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
        "Discord verification failed."
      );
    }

    /*
     * Remove OAuth parameters from the
     * browser URL.
     */
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );

    showSuccess();

  } catch (error) {

    showFatalError(
      error.message
    );
  }
}

handleDiscordCallback();
