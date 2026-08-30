"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import { usePathname,useRouter } from "next/navigation";
import React, { Suspense,useState } from "react";

// New dashboard layout elements
import { AppSidebar } from "@/components/app-sidebar";
import { PortalTopbar } from "@/components/portal-topbar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeCustomizer, ThemeCustomizerTrigger } from "@/components/theme-customizer";
import { Button } from "@/components/ui/button";
import { SidebarInset,SidebarProvider } from "@/components/ui/sidebar";
import { isRouteAuthorized } from "@/config/nav-config";
import { useLogoutMutation } from "@/features/auth/authApi";
import { logout } from "@/features/auth/authSlice";
import { useSidebarConfig } from "@/hooks/use-sidebar-config";
import { getPrimaryRole, getUserRoles } from "@/lib/access-control";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

const AUTHORIZED_ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER", "USER", "GUARDIAN"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const auth = useAppSelector((state) => state.auth);
  const user = auth.user as any;
  const isAuthenticated = auth.isAuthenticated;
  const [logoutMutation] = useLogoutMutation();

  const [themeCustomizerOpen, setThemeCustomizerOpen] = useState(false);
  const { config } = useSidebarConfig();

  const pathname = usePathname();

  const userRoles = React.useMemo<string[]>(() => getUserRoles(user), [user]);

  const hasAuthorizedRole = React.useMemo(
    () => userRoles.some((role) => AUTHORIZED_ROLES.includes(role)),
    [userRoles],
  );

  // Derived from the same nav-config tree that drives the sidebar, so a route's
  // access requirement can never drift from what's shown as a menu item for it.
  // The rule itself lives in nav-config so it is testable without rendering
  // this shell — see nav-config.test.ts.
  const routeAuthorized = React.useMemo(
    () => isRouteAuthorized(pathname, user),
    [pathname, user],
  );

  // Auth state is already settled by AuthInitializer before this layout mounts,
  // so an unauthenticated user here is final — send them to login instead of
  // stranding them on the spinner.
  React.useEffect(() => {
    if (!isAuthenticated || !user) {
      router.replace("/login");
    }
  }, [isAuthenticated, user, router]);

  const handleLogout = async () => {
    try {
      await logoutMutation().unwrap();
      dispatch(logout());
      router.push("/");
    } catch {
      dispatch(logout());
      router.push("/");
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            Redirecting to sign in...
          </p>
        </div>
      </div>
    );
  }

  if (!hasAuthorizedRole || !routeAuthorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-card p-8 text-center shadow-lg">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold text-card-foreground">
              Access Denied
            </h1>
            <p className="text-xs leading-relaxed text-muted-foreground">
              You do not have permission to access this page. Please contact your administrator if
              you believe this is an error.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={() => router.push("/")}
              variant="outline"
              className="h-11 w-full cursor-pointer rounded-xl text-xs font-semibold"
            >
              Go to Home Page
            </Button>
            <Button
              onClick={handleLogout}
              className="h-11 w-full cursor-pointer rounded-xl text-xs font-semibold"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Guardian/Student get a lightweight topbar-only shell instead of the
  // admin-style collapsible sidebar — their real navigation surface is just
  // their portal home plus a handful of permission-gated pages, so the full
  // sidebar chrome (multi-group nav, theme customizer) is unwarranted complexity.
  const primaryRole = getPrimaryRole(user);
  if (primaryRole === "GUARDIAN" || primaryRole === "STUDENT") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <PortalTopbar user={user} onLogout={handleLogout} />
        <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 md:gap-6 lg:px-6">
            <Suspense
              fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              {children}
            </Suspense>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const sidebarContent = (
    <AppSidebar
      user={user}
      variant={config.variant}
      collapsible={config.collapsible}
      side={config.side}
    />
  );

  const innerContent = (
    <SidebarInset>
      <SiteHeader user={user} onLogout={handleLogout} />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-[calc(100vh-var(--header-height)-75px)] flex-1 flex-col outline-none"
      >
        <div className="flex flex-1 flex-col gap-2">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:gap-6 lg:px-6">
            {/* The list pages read their filter/sort/page state from the URL via
                useListQueryState -> useSearchParams, which opts its subtree out of prerendering and
                fails a production build unless a boundary sits above it. One boundary here covers
                every dashboard page instead of repeating it in each of them. */}
            <Suspense
              fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              {children}
            </Suspense>
          </div>
        </div>
      </main>
      <SiteFooter />
    </SidebarInset>
  );

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3rem",
          "--header-height": "3.5rem",
        } as React.CSSProperties
      }
      className={config.collapsible === "none" ? "sidebar-none-mode" : ""}
    >
      {/* Skip to main content — screen reader + keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:outline-none"
      >
        Skip to content
      </a>
      {config.side === "left" ? (
        <>
          {sidebarContent}
          {innerContent}
        </>
      ) : (
        <>
          {innerContent}
          {sidebarContent}
        </>
      )}

      {/* Theme Customizer Controls */}
      <ThemeCustomizerTrigger onClick={() => setThemeCustomizerOpen(true)} />
      <ThemeCustomizer open={themeCustomizerOpen} onOpenChange={setThemeCustomizerOpen} />
    </SidebarProvider>
  );
}
