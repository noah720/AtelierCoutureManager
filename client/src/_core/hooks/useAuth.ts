import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

/**
 * État d'authentification de l'utilisateur courant.
 * La connexion se fait via `trpc.auth.login` / `trpc.auth.register`
 * (page /login), la déconnexion via `logout()` ci-dessous.
 */
export function useAuth() {
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error,
      isAuthenticated: Boolean(meQuery.data),
      logout,
    };
  }, [meQuery.data, meQuery.isLoading, meQuery.error, logoutMutation.isPending, logout]);

  useEffect(() => {
    if (meQuery.error instanceof TRPCClientError && meQuery.error.data?.code === "UNAUTHORIZED") {
      utils.auth.me.setData(undefined, null);
    }
  }, [meQuery.error, utils]);

  return state;
}
