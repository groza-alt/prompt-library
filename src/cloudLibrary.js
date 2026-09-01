import { supabase } from "./supabaseClient";

export const emptyLibrary = { prompts: [], topics: [], trash: [], revision: 0 };

function readLegacyValue(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function readLegacyLibrary() {
  const library = {
    prompts: readLegacyValue("quiet-shelf.prompts.v1", []),
    topics: readLegacyValue("quiet-shelf.topics.v1", []),
    trash: readLegacyValue("quiet-shelf.trash.v1", []),
  };
  const promptRevision = [...library.prompts, ...library.trash].reduce(
    (latest, prompt) => Math.max(latest, Number(prompt.updatedAt || prompt.deletedAt || 0)),
    0,
  );
  return {
    ...library,
    revision: promptRevision || (library.topics.length ? 1 : 0),
  };
}

function stripRuntimeImages(items) {
  return items.map(({ image, ...item }) => item);
}

export function serializeLibrary(library) {
  return {
    prompts: stripRuntimeImages(library.prompts),
    topics: library.topics,
    trash: stripRuntimeImages(library.trash),
    revision: library.revision || 0,
  };
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(",");
  const mimeType = header.match(/data:([^;]+)/)?.[1] || "image/jpeg";
  const bytes = atob(encoded);
  const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) buffer[index] = bytes.charCodeAt(index);
  return new Blob([buffer], { type: mimeType });
}

function extensionFor(type) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

async function signedPreview(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("prompt-previews").createSignedUrl(path, 60 * 60 * 24 * 7);
  if (error) throw error;
  return data.signedUrl;
}

async function preparePrompt(userId, prompt) {
  if (prompt.image?.startsWith("data:image/")) {
    const blob = dataUrlToBlob(prompt.image);
    const path = `${userId}/${prompt.id}.${extensionFor(blob.type)}`;
    const { error } = await supabase.storage.from("prompt-previews").upload(path, blob, {
      contentType: blob.type,
      upsert: true,
    });
    if (error) throw error;
    return { ...prompt, imagePath: path, image: await signedPreview(path) };
  }

  if (prompt.imagePath && (!prompt.image || prompt.image.startsWith("blob:"))) {
    return { ...prompt, image: await signedPreview(prompt.imagePath) };
  }

  return prompt;
}

export async function prepareLibrary(userId, library) {
  return {
    prompts: await Promise.all(library.prompts.map((prompt) => preparePrompt(userId, prompt))),
    topics: library.topics,
    trash: await Promise.all(library.trash.map((prompt) => preparePrompt(userId, prompt))),
    revision: library.revision || 0,
  };
}

export async function loadCloudLibrary(userId) {
  const { data, error } = await supabase
    .from("library_state")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.data) return null;
  return prepareLibrary(userId, { ...emptyLibrary, ...data.data });
}

export async function saveCloudLibrary(userId, library) {
  const prepared = await prepareLibrary(userId, library);
  const serialized = serializeLibrary(prepared);
  const { data, error } = await supabase.from("library_state").upsert({
    user_id: userId,
    data: serialized,
    updated_at: new Date().toISOString(),
  }).select("data").single();
  if (error) throw error;
  if (Number(data?.data?.revision || 0) !== Number(serialized.revision || 0)) {
    throw new Error("Cloud save verification failed");
  }
  return prepared;
}
