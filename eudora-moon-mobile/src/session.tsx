import React from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';

import { registerSession, signInSession, signOutSession, store, storyApi, type AppDispatch, type RootState } from '@/store';
import { restoreSession } from '@/store';

type Session = {
  tokens: RootState['session']['tokens'];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (details: { firstName: string; lastName: string; email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  React.useEffect(() => { void dispatch(restoreSession()); }, [dispatch]);
  return <>{children}</>;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <Provider store={store}><SessionBootstrap>{children}</SessionBootstrap></Provider>;
}

export function useSession(): Session {
  const dispatch = useDispatch<AppDispatch>();
  const tokens = useSelector((state: RootState) => state.session.tokens);
  const loading = useSelector((state: RootState) => state.session.status === 'loading');
  return React.useMemo(() => ({
    tokens,
    loading,
    signIn: async (email: string, password: string) => {
      await dispatch(signInSession({ email, password })).unwrap();
      dispatch(storyApi.util.resetApiState());
    },
    register: async (details) => {
      await dispatch(registerSession(details)).unwrap();
      dispatch(storyApi.util.resetApiState());
    },
    signOut: async () => {
      await dispatch(signOutSession()).unwrap();
      dispatch(storyApi.util.resetApiState());
    },
  }), [dispatch, loading, tokens]);
}
