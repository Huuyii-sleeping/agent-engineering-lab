export type AppRoute = "landing" | "workspace";

export const landingRoutePath = "/studio";
export const workspaceRoutePath = "/";

/** Resolve the top-level application route from the browser pathname. */
export function appRouteFromPathname(pathname: string): AppRoute {
  return pathname === landingRoutePath ? "landing" : "workspace";
}

/** Return the browser pathname for a top-level application route. */
export function appRoutePath(route: AppRoute): string {
  return route === "landing" ? landingRoutePath : workspaceRoutePath;
}
