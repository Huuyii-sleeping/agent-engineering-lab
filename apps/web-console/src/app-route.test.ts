import { describe, expect, it } from "vitest";
import { appRouteFromPathname, appRoutePath } from "./app-route";

describe("app-route", () => {
  it("uses a dedicated route for the landing page", () => {
    expect(appRouteFromPathname("/studio")).toBe("landing");
    expect(appRoutePath("landing")).toBe("/studio");
  });

  it("uses the workspace route for the root path and unknown spa paths", () => {
    expect(appRouteFromPathname("/")).toBe("workspace");
    expect(appRouteFromPathname("/agents")).toBe("workspace");
    expect(appRoutePath("workspace")).toBe("/");
  });
});
