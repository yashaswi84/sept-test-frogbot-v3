// DEMO: intentional inactive/fake secret for Frogbot Secrets + dynamic token validation.
// This is NOT a real credential. Do not replace with a live token.
// Expected: Secrets scanner detects it; dynamic validation reports inactive / invalid / not active.

module.exports = {
  // GitHub PAT-shaped token (ghp_ + 36 chars). All zeros → not a live credential.
  GITHUB_TOKEN: "ghp_000000000000000000000000000000000000",
};
