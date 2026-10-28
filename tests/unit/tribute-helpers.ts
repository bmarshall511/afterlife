import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

export function setupEnv() {
  process.env.PGLITE_MEMORY = "1";
  delete process.env.DATABASE_URL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOBS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "afterlife-blobs-"));
  process.env.TRIBUTE_INVITE_TOKEN = "test-invite-token";
  process.env.ADMIN_PASSWORD = "correct horse battery";
  return process.env.BLOBS_DIR;
}

export function jpeg(width: number, height: number, opts: { orientation?: number; gps?: boolean } = {}) {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } });
  if (opts.gps) img = img.withExif({ IFD0: { Make: "TestCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 0/1" } });
  if (opts.orientation) img = img.withMetadata({ orientation: opts.orientation });
  return img.jpeg().toBuffer();
}
