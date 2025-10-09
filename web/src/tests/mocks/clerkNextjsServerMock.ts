type ClerkServerAuthState = {
  userId: string | null;
  user: any;
};

const state: ClerkServerAuthState = {
  userId: null,
  user: null,
};

export const auth = () => ({ userId: state.userId });

export const currentUser = async () => state.user;

export function __setMockServerAuthState(next: { userId: string | null; user?: any }) {
  state.userId = next.userId;
  state.user = next.user ?? null;
}

export const clerkMiddleware = () => () => {};

