export type AppRoute = "landing" | "workspace";

export const landingRoutePath = "/";
export const workspaceRoutePath = "/studio";

/** Resolve the top-level application route from the browser pathname. */
export function appRouteFromPathname(pathname: string): AppRoute {
  return pathname === workspaceRoutePath ? "workspace" : "landing";
}

/** Return the browser pathname for a top-level application route. */
export function appRoutePath(route: AppRoute): string {
  return route === "landing" ? landingRoutePath : workspaceRoutePath;
}
