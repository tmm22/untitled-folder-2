type ClerkServerAuthState = {
  userId: string | null;
  user: any;
  sessionId: string | null;
};

const state: ClerkServerAuthState = {
  userId: null,
  user: null,
  sessionId: null,
};

export const getAuth = (_request?: Request) => ({
  userId: state.userId,
  sessionId: state.sessionId,
  isSignedIn: Boolean(state.userId),
});

export const auth = () => getAuth();

export const currentUser = async () => state.user;

export function __setMockServerAuthState(next: { userId: string | null; user?: any; sessionId?: string | null }) {
  state.userId = next.userId;
  state.user = next.user ?? null;
  state.sessionId = next.sessionId ?? null;
}

export const clerkMiddleware = () => () => {};
