export const toastErrorMock = vi.fn();
export const toastSuccessMock = vi.fn();
export const toastInfoMock = vi.fn();
export const toastWarningMock = vi.fn();

export const toast = {
  error: toastErrorMock,
  success: toastSuccessMock,
  info: toastInfoMock,
  warning: toastWarningMock,
};
