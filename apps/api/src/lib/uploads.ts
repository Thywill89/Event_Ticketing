import { randomBytes } from "node:crypto";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import multer from "multer";
import { env } from "../config/env";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function extForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return "";
  }
}

/** Keep the file in memory; we push the buffer to Supabase Storage. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"));
      return;
    }
    cb(null, true);
  },
});

let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseAdmin;
}

function objectKey(eventId: string, originalName: string, mime: string): string {
  const ext = extForMime(mime) || path.extname(originalName) || ".bin";
  const name = `${Date.now()}_${randomBytes(8).toString("hex")}${ext}`;
  return `events/${eventId}/${name}`;
}

/** Remove every stored image under `events/<eventId>/` (cover and gallery). */
export async function deleteEventImages(eventId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const bucket = supabase.storage.from(env.supabaseStorageBucket);
  const prefix = `events/${eventId}`;

  for (;;) {
    const { data, error } = await bucket.list(prefix, { limit: 100 });
    if (error) throw new Error(`Storage list failed: ${error.message}`);
    if (!data || data.length === 0) return;

    const { error: removeError } = await bucket.remove(
      data.map((file) => `${prefix}/${file.name}`),
    );
    if (removeError) throw new Error(`Storage delete failed: ${removeError.message}`);
    if (data.length < 100) return;
  }
}

/**
 * Upload an event image buffer to the Supabase Storage bucket.
 * Returns the public object URL (bucket must be public or have a public policy).
 */
export async function uploadEventImage(params: {
  eventId: string;
  file: Express.Multer.File;
}): Promise<string> {
  const { eventId, file } = params;
  if (!file.buffer?.length) {
    throw new Error("Empty image upload");
  }

  const supabase = getSupabaseAdmin();
  const bucket = env.supabaseStorageBucket;
  const key = objectKey(eventId, file.originalname, file.mimetype);

  const { error } = await supabase.storage.from(bucket).upload(key, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
    cacheControl: "3600",
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  if (!data?.publicUrl) {
    throw new Error("Storage upload succeeded but no public URL was returned");
  }
  return data.publicUrl;
}
