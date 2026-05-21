import "@testing-library/jest-dom/vitest";

// Provide required env stubs for tests that import modules which trigger env validation.
// These are safe test values — never used for real connections.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/get_a_bud_test";
process.env.NEXTAUTH_SECRET ??= "test-secret-32-bytes-long-enough";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.FIELD_ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

// jsdom does not compute CSS reliably. @testing-library/user-event v14+ checks
// `getComputedStyle(...).pointerEvents` before every interaction and rejects it
// when the value is "none". In jsdom on Linux (CI), this check returns false
// positives — elements that are perfectly interactable get blocked. Patch
// getComputedStyle to never report pointer-events: none unless the element has
// an explicit inline style setting it. This matches real browser behavior where
// elements without explicit pointer-events inherit "auto".
if (typeof window !== "undefined") {
  const _getComputedStyle = window.getComputedStyle;
  window.getComputedStyle = (elt: Element, pseudoElt?: string | null) => {
    const style = _getComputedStyle(elt, pseudoElt);
    if (
      style.pointerEvents === "none" &&
      !(elt as HTMLElement).style?.pointerEvents
    ) {
      Object.defineProperty(style, "pointerEvents", {
        value: "",
        configurable: true,
      });
    }
    return style;
  };
}
