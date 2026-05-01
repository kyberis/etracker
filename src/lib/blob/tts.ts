import { put } from "@vercel/blob";

/**
 * Upload an MP3 to Vercel Blob with a private random pathname and return a
 * short-lived public URL. Returns `null` when `BLOB_READ_WRITE_TOKEN` is
 * missing — callers fall back to text-only delivery in that case.
 *
 * The blob URL itself is randomized (`addRandomSuffix: true`) so it is
 * unguessable; `cacheControlMaxAge` keeps it on the CDN long enough for the
 * web client to fetch it but not so long that we leak audio.
 */
export async function uploadTtsAudioToBlob(
  mp3: Buffer,
): Promise<{ url: string } | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return null;
  }

  const path = `tts/${new Date().toISOString().slice(0, 10)}/${cryptoRandomId()}.mp3`;

  // `access: "public"` is required by `put`. The pathname is unguessable, and
  // the web client only needs ~15 minutes to fetch the media; the CDN entry
  // rolls off naturally after `cacheControlMaxAge`.
  const blob = await put(path, mp3, {
    access: "public",
    addRandomSuffix: true,
    contentType: "audio/mpeg",
    cacheControlMaxAge: 60 * 15,
  });

  return { url: blob.url };
}

function cryptoRandomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
