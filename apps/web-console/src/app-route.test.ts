import { describe, expect, it } from "vitest";
import { appRouteFromPathname, appRoutePath } from "./app-route";

describe("app-route", () => {
  it("uses the root route for the landing page", () => {
    expect(appRouteFromPathname("/")).toBe("landing");
    expect(appRouteFromPathname("/unknown")).toBe("landing");
    expect(appRoutePath("landing")).toBe("/");
  });

  it("uses a dedicated studio route for the workspace", () => {
    expect(appRouteFromPathname("/studio")).toBe("workspace");
    expect(appRoutePath("workspace")).toBe("/studio");
  });
});
