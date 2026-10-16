const DB = "campnect-demo-media-v1";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(new Error("Local media storage is unavailable."));
  });
}
export async function putMedia(file: Blob) {
  if (
    !/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)|audio\/|application\/pdf)/.test(
      file.type,
    )
  )
    throw new Error("Use a supported image, video, audio or PDF file.");
  if (file.size > 40 * 1024 * 1024)
    throw new Error("Demo uploads are limited to 40 MB per file.");
  const db = await open(),
    id = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new Error("Media could not be saved. Browser storage may be full."),
      );
    tx.onabort = tx.onerror;
  }).finally(() => db.close());
  return `/api/media/demo-${id}`;
}
export async function getMedia(id: string): Promise<Blob> {
  const db = await open();
  return new Promise<Blob>((resolve, reject) => {
    const req = db
      .transaction("files")
      .objectStore("files")
      .get(id.replace("demo-", ""));
    req.onsuccess = () =>
      req.result
        ? resolve(req.result)
        : reject(new Error("This local media file is missing."));
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}
export async function clearMedia() {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
}
