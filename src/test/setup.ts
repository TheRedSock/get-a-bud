import "@testing-library/jest-dom/vitest";

// Provide required env stubs for tests that import modules which trigger env validation.
// These are safe test values — never used for real connections.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/get_a_bud_test";
process.env.NEXTAUTH_SECRET ??= "test-secret-32-bytes-long-enough";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.FIELD_ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

// jsdom does not provide ResizeObserver. Stub it so components that use it
// (e.g. custom select scroll tracking) can mount without throwing.
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// jsdom does not compute CSS. @testing-library/user-event v14+ walks the
// ancestor chain calling getComputedStyle on each element and rejects
// interactions when any ancestor reports pointer-events: none. On Linux CI,
// jsdom falsely reports pointer-events: none on <body>. The
// Object.defineProperty approach fails because jsdom's CSSStyleDeclaration is
// non-configurable on some platforms. Use a Proxy to intercept property reads.
if (typeof window !== "undefined") {
  const _getComputedStyle = window.getComputedStyle;
  window.getComputedStyle = (elt: Element, pseudoElt?: string | null) => {
    const style = _getComputedStyle(elt, pseudoElt);
    return new Proxy(style, {
      get(target, prop, receiver) {
        if (prop === "pointerEvents") return "";
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === "function") {
          return value.bind(target);
        }
        return value;
      },
    });
  };
}
