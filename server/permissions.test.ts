import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertAllowedRole } from "./routers";

describe("tenant role permissions", () => {
  it("allows a manager to manage stores and inventory", () => {
    expect(() => assertAllowedRole("manager", ["owner", "manager"])).not.toThrow();
  });

  it("rejects staff from manager-only mutations", () => {
    expect(() => assertAllowedRole("staff", ["owner", "manager"])).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }) as TRPCError,
    );
  });

  it("allows staff to create operational orders", () => {
    expect(() => assertAllowedRole("staff", ["owner", "manager", "staff"])).not.toThrow();
  });
});
