import { create } from "zustand";
import { errorMessage } from "../errors";
import {
  clearStoredSession,
  consumeAuthSessionFromUrl,
  restoreAuthSession,
  subscribeToAuthSession,
  type AuthSession
} from "../services/auth.service";

type SessionStatus = "idle" | "checking" | "ready" | "error";

type AuthState = {
  session: AuthSession | null;
  status: SessionStatus;
  error: string | null;
  recoveryError: string | null;
  initialize: () => Promise<void>;
  retry: () => Promise<void>;
  setSession: (session: AuthSession) => void;
  clearSession: () => void;
};

let initializePromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()((set, get) => ({
  session: null,
  status: "idle",
  error: null,
  recoveryError: null,

  initialize: async () => {
    if (get().status === "ready") {
      return;
    }

    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = initializeAuth(set).finally(() => {
      initializePromise = null;
    });
    return initializePromise;
  },

  retry: async () => {
    set({ status: "idle", error: null });
    return get().initialize();
  },

  setSession: (session) => {
    set({
      session,
      status: "ready",
      error: null,
      recoveryError: null
    });
  },

  clearSession: () => {
    clearStoredSession();
    set({
      session: null,
      status: "ready",
      error: null,
      recoveryError: null
    });
  }
}));

const unsubscribeFromAuthSession = subscribeToAuthSession((session) => {
  useAuthStore.setState({
    session,
    error: session ? null : useAuthStore.getState().error
  });
});

if (import.meta.hot) {
  import.meta.hot.dispose(unsubscribeFromAuthSession);
}

async function initializeAuth(set: (partial: Partial<AuthState>) => void): Promise<void> {
  set({ status: "checking", error: null });

  let recoverySession: AuthSession | null = null;
  let recoveryError: string | null = null;
  try {
    recoverySession = consumeAuthSessionFromUrl();
  } catch (error) {
    recoveryError = errorMessage(error);
  }

  if (recoverySession) {
    set({
      session: recoverySession,
      status: "ready",
      recoveryError
    });
    return;
  }

  try {
    const session = await restoreAuthSession();
    set({
      session,
      status: "ready",
      error: null,
      recoveryError
    });
  } catch (error) {
    set({
      session: null,
      status: "error",
      error: errorMessage(error),
      recoveryError
    });
  }
}
