import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

// A throwaway directory so the test never touches a real upload folder.
const root = await fs.mkdtemp(path.join(os.tmpdir(), "oa-storage-"));

vi.mock("./_core/env", () => ({
  ENV: { forgeApiUrl: "", forgeApiKey: "", localStorageDir: root },
}));

const { storagePut, storageGetSignedUrl } = await import("./storage");
const { isLocalStorage, localStoragePath } = await import(
  "./_core/localStorage"
);

let cwd: string;
beforeAll(() => {
  // localStorageRoot resolves against cwd; root is already absolute so this
  // only pins the behaviour of the resolve.
  cwd = process.cwd();
});
afterAll(async () => {
  process.chdir(cwd);
  await fs.rm(root, { recursive: true, force: true });
});

describe("local storage fallback", () => {
  it("engages when no storage service is configured", () => {
    expect(isLocalStorage()).toBe(true);
  });

  it("writes an upload to disk and returns a servable url", async () => {
    const { key, url } = await storagePut(
      "wardrobe/coat.png",
      Buffer.from("pretend-png-bytes"),
      "image/png"
    );

    expect(url).toBe(`/manus-storage/${key}`);
    // The key is suffixed to avoid collisions, but keeps its folder and type.
    expect(key).toMatch(/^wardrobe\/coat_[0-9a-f]{8}\.png$/);

    const written = await fs.readFile(path.join(root, key), "utf8");
    expect(written).toBe("pretend-png-bytes");
  });

  it("creates nested folders that do not exist yet", async () => {
    const { key } = await storagePut("a/b/c/deep.jpg", Buffer.from("x"));
    await expect(fs.readFile(path.join(root, key), "utf8")).resolves.toBe("x");
  });

  it("hands back a plain path instead of a signed url", async () => {
    await expect(storageGetSignedUrl("wardrobe/coat.png")).resolves.toBe(
      "/manus-storage/wardrobe/coat.png"
    );
  });

  // Keys arrive straight off request URLs, so escaping the storage root would
  // let anyone read arbitrary files off the server.
  it.each([
    "../../../etc/passwd",
    "../.env",
    "wardrobe/../../secrets.json",
    "..",
  ])("refuses to resolve %s outside the storage root", key => {
    expect(() => localStoragePath(key)).toThrow(/Invalid storage key/);
  });

  it("still resolves ordinary keys, including ones that climb and return", () => {
    expect(localStoragePath("wardrobe/a/../coat.png")).toBe(
      path.join(root, "wardrobe/coat.png")
    );
  });
});
