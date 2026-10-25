/*
 * AI provider stub (OFF by default).
 *
 * The demo runs fully offline with the scripted engine in bot-engine.js.
 * To add an LLM (e.g. OpenAI) later:
 *   1. Create a tiny server-side function (Vercel/Netlify/Cloudflare function) at
 *      BAKERY_BOT_CONFIG.aiEndpoint that holds OPENAI_API_KEY as an environment
 *      variable and forwards { messages, lang, businessFacts } to the model.
 *   2. Set BAKERY_BOT_CONFIG.mode = "openai" in js/config.js.
 *   3. Implement `reply()` below (the fetch is already sketched out).
 *
 * The API key must live ONLY on the server. Never ship it to the browser.
 */
(function () {
  var SC = (window.SunnyCrumb = window.SunnyCrumb || {});

  SC.AIProvider = {
    /** True only when the config asks for it. The scripted bot is always the fallback. */
    isEnabled: function () {
      return window.BAKERY_BOT_CONFIG.mode === "openai";
    },

    /**
     * @param {Array<{role:"user"|"assistant", content:string}>} history
     * @param {{lang:"en"|"es", facts:object}} context  business facts to ground the model
     * @returns {Promise<string>} assistant reply text
     */
    reply: async function (history, context) {
      // --- Example implementation (left commented on purpose) ---
      // const res = await fetch(window.BAKERY_BOT_CONFIG.aiEndpoint, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ messages: history, lang: context.lang, facts: context.facts }),
      // });
      // if (!res.ok) throw new Error("AI endpoint error " + res.status);
      // const data = await res.json();
      // return data.reply;
      throw new Error("AI mode is not configured (this demo is scripted-only).");
    },
  };
})();
