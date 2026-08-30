import { describe, expect, it } from "vitest";

import { flattenNavLeaves, isRouteAuthorized, resolveNavLeaf } from "./nav-config";

/**
 * The client-side route guard.
 *
 * Not a security boundary on its own — the API enforces its own — but it is
 * what decides whether a signed-in user sees a page or "Access Denied", and
 * every rule here has a way of being wrong that looks right.
 */

const student = { roles: [{ role: { name: "USER" } }] };
const teacher = { roles: [{ role: { name: "TEACHER" } }] };
const guardian = { roles: [{ role: { name: "GUARDIAN" } }] };
const admin = { roles: [{ role: { name: "ADMIN" } }] };
const superAdmin = { roles: [{ role: { name: "SUPER_ADMIN" } }] };

describe("resolveNavLeaf", () => {
  it("prefers the longer match when one route prefixes another", () => {
    // /stories would also match /stories/... if order were not by length.
    expect(resolveNavLeaf("/story-library")?.url).toBe("/story-library");
    expect(resolveNavLeaf("/stories")?.url).toBe("/stories");
  });

  it("claims child paths of a leaf", () => {
    expect(resolveNavLeaf("/story-library/abc-123")?.url).toBe("/story-library");
  });

  it("does not treat a shared prefix as a match", () => {
    // "/stories" must not claim "/story-library" just by string prefix.
    expect(resolveNavLeaf("/story-library")?.url).not.toBe("/stories");
  });

  it("returns nothing for a path no leaf claims", () => {
    expect(resolveNavLeaf("/nowhere")).toBeUndefined();
  });
});

describe("isRouteAuthorized", () => {
  it("lets a student into the story library but not the story editor", () => {
    expect(isRouteAuthorized("/story-library", student)).toBe(true);
    expect(isRouteAuthorized("/story-library/abc-123", student)).toBe(true);
    expect(isRouteAuthorized("/stories", student)).toBe(false);
  });

  it("lets a guardian read stories with their child", () => {
    expect(isRouteAuthorized("/story-library", guardian)).toBe(true);
  });

  it("lets a teacher author them", () => {
    expect(isRouteAuthorized("/stories", teacher)).toBe(true);
  });

  it("denies a user with no roles at all", () => {
    expect(isRouteAuthorized("/story-library", { roles: [] })).toBe(false);
    expect(isRouteAuthorized("/story-library", null)).toBe(false);
  });

  it("keeps each portal to its own audience", () => {
    // These are the leaves whose comments say admins were deliberately removed;
    // a blanket SUPER_ADMIN bypass would silently undo that.
    expect(isRouteAuthorized("/parent", guardian)).toBe(true);
    expect(isRouteAuthorized("/parent", student)).toBe(false);
    expect(isRouteAuthorized("/parent", superAdmin)).toBe(false);
    expect(isRouteAuthorized("/student", student)).toBe(true);
    expect(isRouteAuthorized("/student", guardian)).toBe(false);
    expect(isRouteAuthorized("/dashboard", admin)).toBe(true);
    expect(isRouteAuthorized("/dashboard", student)).toBe(false);
  });

  it("denies hidden leaves to everyone, including super admin", () => {
    const hidden = flattenNavLeaves().filter((l) => l.hidden || l.disabled);
    expect(hidden.length).toBeGreaterThan(0);
    for (const leaf of hidden) {
      expect(isRouteAuthorized(leaf.url, superAdmin)).toBe(false);
      expect(isRouteAuthorized(leaf.url, admin)).toBe(false);
    }
  });

  it("falls through to allow for routes with no nav entry", () => {
    // Documented behaviour, and the reason portal leaves must stay in the
    // config: deleting one would open its URL to every signed-in user.
    expect(isRouteAuthorized("/some/unlisted/page", student)).toBe(true);
  });

  it("reads roles from every shape the API returns them in", () => {
    expect(isRouteAuthorized("/stories", { role: "TEACHER" })).toBe(true);
    expect(isRouteAuthorized("/stories", { roles: ["TEACHER"] })).toBe(true);
    expect(isRouteAuthorized("/stories", { roles: [{ name: "TEACHER" }] })).toBe(true);
    expect(isRouteAuthorized("/stories", teacher)).toBe(true);
  });

  it("honours permission requirements, not just roles", () => {
    const withPerm = {
      roles: [{ role: { name: "TEACHER" } }],
      permissions: [{ action: "read", subject: "Homework" }],
    };
    const withoutPerm = { roles: [{ role: { name: "TEACHER" } }], permissions: [] };
    expect(isRouteAuthorized("/homework", withPerm)).toBe(true);
    expect(isRouteAuthorized("/homework", withoutPerm)).toBe(false);
    // SUPER_ADMIN bypasses permission checks, matching the backend guards.
    expect(isRouteAuthorized("/homework", superAdmin)).toBe(true);
  });
});

describe("nav config integrity", () => {
  it("gives every leaf a unique url", () => {
    const urls = flattenNavLeaves().map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("starts every url with a slash, so prefix matching behaves", () => {
    for (const leaf of flattenNavLeaves()) {
      expect(leaf.url.startsWith("/")).toBe(true);
      expect(leaf.url.endsWith("/")).toBe(false);
    }
  });
});
