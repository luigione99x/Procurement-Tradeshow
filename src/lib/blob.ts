import { put, del } from "@vercel/blob";

export function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function uploadDocumento(praticaId: string, fileName: string, file: File) {
  if (!blobConfigured()) {
    throw new Error(
      "Archivio documenti non configurato: manca BLOB_READ_WRITE_TOKEN. Collega uno Storage Blob al progetto Vercel."
    );
  }
  const key = `pratiche/${praticaId}/${Date.now()}-${fileName}`;
  const blob = await put(key, file, {
    access: "public",
    addRandomSuffix: false,
  });
  return blob;
}

export async function deleteDocumento(blobUrl: string) {
  if (!blobConfigured()) return;
  await del(blobUrl);
}
