export type RootActionState = {
  success?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export const rootActionInitialState: RootActionState = {
  success: undefined,
};
