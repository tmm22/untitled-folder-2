import type { ReactNode } from 'react';

type ClerkMockUser = {
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddress?: { emailAddress: string };
  emailAddresses?: { emailAddress: string }[];
  imageUrl?: string | null;
};

type ClerkAuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  user: ClerkMockUser | null;
};

const state: ClerkAuthState = {
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  user: null,
};

export function ClerkProvider({ children }: { children: ReactNode }) {
  return children;
}

export const SignedIn = ({ children }: { children: ReactNode }) => (state.isSignedIn ? children : null);

export const SignedOut = ({ children }: { children: ReactNode }) => (!state.isSignedIn ? children : null);

export const SignInButton = ({ children }: { children: ReactNode }) => children;

export const UserButton = () => null;

export const useAuth = () => ({
  isLoaded: state.isLoaded,
  isSignedIn: state.isSignedIn,
  userId: state.userId,
});

export const useUser = () => ({ user: state.user });

export function __setMockClerkState(next: Partial<ClerkAuthState>) {
  Object.assign(state, next);
}

