import { validateRemoteDirectory, validateRemoteFileName } from "./filezilla-queue";

export type FtpRemoteCandidate = {
  id: string;
  remoteDirectory: string;
  remoteName: string;
  sizeBytes?: number;
};

export type FtpParseResult = {
  candidates: FtpRemoteCandidate[];
  rejected: number;
};

export const MAX_FTP_LIST_BYTES = 2_000_000;
export const MAX_FTP_LIST_LINES = 10_000;

const AUDIO_FILE_EXTENSION = /\.(?:mp3|flac|wav|aiff?|m4a|aac|ogg|alac)$/i;

function splitRemotePath(value: string) {
  const path = value.trim();
  const separator = path.lastIndexOf("/");
  if (separator < 0) throw new Error("Falta la carpeta remota.");
  const remoteDirectory = separator === 0 ? "/" : path.slice(0, separator);
  const remoteName = path.slice(separator + 1);
  validateRemoteDirectory(remoteDirectory);
  validateRemoteFileName(remoteName);
  if (!AUDIO_FILE_EXTENSION.test(remoteName)) throw new Error("No parece un archivo de audio compatible.");
  return { remoteDirectory, remoteName };
}

export function ftpListingLimitProblem(value: string) {
  if (new TextEncoder().encode(value).byteLength > MAX_FTP_LIST_BYTES) {
    return "El listado supera 2 MB. Usa solamente los resultados de esta búsqueda.";
  }
  if (value.split(/\r?\n/, MAX_FTP_LIST_LINES + 1).length > MAX_FTP_LIST_LINES) {
    return "El listado supera 10.000 líneas. Divídelo en lotes más pequeños para poder revisarlo.";
  }
  return "";
}

export function parseRemoteListing(value: string): FtpParseResult {
  const candidates: FtpRemoteCandidate[] = [];
  const seen = new Set<string>();
  let rejected = 0;

  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const fields = line
      .split(/\t|\s+\|\s+/)
      .map((field) => field.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
    let remotePath = "";

    const urlField = fields.find((field) => /^(?:ftp|ftps|sftp):\/\//i.test(field));
    if (urlField) {
      try {
        const parsed = new URL(urlField);
        remotePath = decodeURIComponent(parsed.pathname);
      } catch {
        remotePath = "";
      }
    }

    if (!remotePath) {
      remotePath = fields.find((field) => field.startsWith("/") && AUDIO_FILE_EXTENSION.test(field)) ?? "";
    }

    if (!remotePath) {
      const directory = fields.find((field) => field.startsWith("/") && !AUDIO_FILE_EXTENSION.test(field));
      const fileName = fields.find((field) => AUDIO_FILE_EXTENSION.test(field) && !field.includes("/"));
      if (directory && fileName) remotePath = `${directory.replace(/\/$/, "")}/${fileName}`;
    }

    if (!remotePath && line.startsWith("/") && AUDIO_FILE_EXTENSION.test(line)) remotePath = line;

    try {
      const parsed = splitRemotePath(remotePath);
      const key = `${parsed.remoteDirectory}/${parsed.remoteName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ id: `remote-${candidates.length + 1}`, ...parsed });
    } catch {
      rejected += 1;
    }
  }

  return { candidates, rejected };
}

function localNameCollisionKey(value: string) {
  return value.normalize("NFC").toUpperCase().toLowerCase().normalize("NFC");
}

export function uniqueLocalNames(candidates: ReadonlyArray<Pick<FtpRemoteCandidate, "remoteName">>) {
  const used = new Set<string>();
  return candidates.map((candidate) => {
    if (!used.has(localNameCollisionKey(candidate.remoteName))) {
      used.add(localNameCollisionKey(candidate.remoteName));
      return candidate.remoteName;
    }
    const extensionAt = candidate.remoteName.lastIndexOf(".");
    const stem = extensionAt > 0 ? candidate.remoteName.slice(0, extensionAt) : candidate.remoteName;
    const extension = extensionAt > 0 ? candidate.remoteName.slice(extensionAt) : "";
    let suffix = 2;
    let localName = `${stem}-${suffix}${extension}`;
    while (used.has(localNameCollisionKey(localName))) {
      suffix += 1;
      localName = `${stem}-${suffix}${extension}`;
    }
    used.add(localNameCollisionKey(localName));
    return localName;
  });
}
