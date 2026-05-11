export const signInMock = vi.fn();

export function signIn(...args: unknown[]) {
  return signInMock(...args);
}
