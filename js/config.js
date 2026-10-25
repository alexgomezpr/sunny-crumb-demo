/*
 * Bot configuration.
 *
 * mode: "scripted"  -> 100% local intent-matching bot (default, no API key, no backend).
 *       "openai"    -> scripted flows (custom order, handoff) stay local, but free-form
 *                      questions the script can't answer are sent to `aiEndpoint`.
 *                      See js/ai-provider.js and README.md ("Plugging in an AI model").
 *
 * NEVER put an API key in this file or anywhere in front-end code.
 */
window.BAKERY_BOT_CONFIG = Object.assign(
  {
    mode: "scripted",
    aiEndpoint: "/api/chat",          // your own serverless proxy (not included)
    typingDelayMs: 550,               // fake "typing" delay for realism
    minOrderLeadDays: 3,              // custom cakes need at least this much notice
    defaultLang: "en",
  },
  window.BAKERY_BOT_CONFIG || {}
);

// Handy for testing: ?fast=1 removes the typing delay, ?lang=es starts in Spanish.
(function () {
  try {
    var p = new URLSearchParams(location.search);
    if (p.get("fast") === "1") window.BAKERY_BOT_CONFIG.typingDelayMs = 0;
    if (p.get("lang") === "es" || p.get("lang") === "en") window.BAKERY_BOT_CONFIG.defaultLang = p.get("lang");
  } catch (e) {}
})();
