export const pushMock = vi.fn();
export const refreshMock = vi.fn();

export function useRouter() {
  return {
    push: pushMock,
    refresh: refreshMock,
  };
}
