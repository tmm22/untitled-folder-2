declare module '@clerk/nextjs' {
  export function __setMockClerkState(state: {
    isLoaded?: boolean;
    isSignedIn?: boolean;
    userId?: string | null;
    user?: any;
  }): void;
}

declare module '@clerk/nextjs/server' {
  export function __setMockServerAuthState(payload: {
    userId: string | null;
    user?: any;
    sessionId?: string | null;
  }): void;
  export function getAuth(request?: Request): {
    userId: string | null;
    sessionId: string | null;
    isSignedIn: boolean;
  };
  export function currentUser(): Promise<any>;
  export function auth(): { userId: string | null; sessionId: string | null; isSignedIn: boolean };
}
