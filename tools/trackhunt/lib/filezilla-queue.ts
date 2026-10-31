export type FileTransferProtocol =
  | "ftp"
  | "ftp-insecure"
  | "ftps-explicit"
  | "ftps-implicit"
  | "sftp";

export type FileZillaPlatform = "mac" | "windows" | "linux";

export interface FileZillaConnection {
  /** Stable reference to the matching local Keychain/Site Manager profile. */
  profileId: string;
  label?: string;
  protocol: FileTransferProtocol;
  host: string;
  port?: number;
  username: string;
  /** Absolute UNIX-style directory that bounds every remote file in this job. */
  remoteRoot?: string;
}

export interface FileZillaQueueFile {
  id: string;
  remoteDirectory: string;
  remoteName: string;
  /** Absolute destination filename, not just a directory. */
  localFile: string;
  sizeBytes?: number;
}

export interface FileZilla3QueueTemplate {
  version: string;
  platform: FileZillaPlatform;
}

export interface FileZillaQueueInput {
  connection: FileZillaConnection;
  /** Absolute local directory that bounds every destination file. */
  localRoot: string;
  files: readonly FileZillaQueueFile[];
  template?: FileZilla3QueueTemplate;
}

export interface TrackHuntJobInput extends FileZillaQueueInput {
  jobId: string;
  createdAt?: string | Date;
}

export interface TrackHuntDownloadJob {
  kind: "trackhunt.download-job";
  version: 1;
  jobId: string;
  createdAt: string;
  connection: {
    profileId: string;
    protocol: FileTransferProtocol;
    host: string;
    port: number;
    remoteRoot: string;
  };
  files: Array<{
    id: string;
    remotePath: string;
    destinationRelativePath: string;
    sizeBytes?: number;
  }>;
}

export class FileZillaQueueValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "FileZillaQueueValidationError";
    this.field = field;
  }
}

/**
 * Stable numeric values from FileZilla 3.x's ServerProtocol enum. FileZilla's
 * source explicitly requires existing values never to change because saved
 * sites depend on them.
 */
export const FILEZILLA_PROTOCOL_CODES: Readonly<Record<FileTransferProtocol, number>> = Object.freeze({
  ftp: 0, // FTP with AUTH TLS attempted by FileZilla.
  sftp: 1,
  "ftps-implicit": 3,
  "ftps-explicit": 4,
  "ftp-insecure": 6,
});

export const FILEZILLA_DEFAULT_PORTS: Readonly<Record<FileTransferProtocol, number>> = Object.freeze({
  ftp: 21,
  "ftp-insecure": 21,
  "ftps-explicit": 21,
  "ftps-implicit": 990,
  sftp: 22,
});

/**
 * Compatibility template for FileZilla 3.x on macOS. Before production UI is
 * wired up, compare a harmless one-file export from the installed FileZilla
 * version and pass its version/platform through calibrateFileZilla3QueueTemplate.
 */
export const FILEZILLA_3X_MAC_QUEUE_TEMPLATE: Readonly<FileZilla3QueueTemplate> = Object.freeze({
  version: "3.69.6",
  platform: "mac",
});

const SECRET_FIELD_NAMES = new Set([
  "authorization",
  "cookie",
  "credential",
  "credentials",
  "keyfile",
  "pass",
  "password",
  "privatekey",
  "secret",
  "token",
]);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HOST_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const FILEZILLA_VERSION = /^3(?:\.\d+){1,3}$/;

function fail(field: string, message: string): never {
  throw new FileZillaQueueValidationError(field, message);
}

function requiredString(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== "string" || !value) fail(field, "debe ser texto no vacío");
  if (value !== value.trim()) fail(field, "no puede comenzar ni terminar con espacios");
  if (value.length > maximumLength) fail(field, `supera ${maximumLength} caracteres`);
  assertNoControlCharacters(value, field);
  assertValidXmlText(value, field);
  return value;
}

function assertNoControlCharacters(value: string, field: string) {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint < 0x20 || codePoint === 0x7f) {
      fail(field, "contiene caracteres de control");
    }
  }
}

function assertValidXmlText(value: string, field: string) {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    const valid = codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    if (!valid) fail(field, "contiene un carácter no válido para XML 1.0");
  }
}

function assertNoCredentialFields(value: object, field: string) {
  for (const key of Object.keys(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    if (SECRET_FIELD_NAMES.has(normalized)) {
      fail(`${field}.${key}`, "las credenciales no pueden formar parte de una cola o manifiesto");
    }
  }
}

function validateIdentifier(value: unknown, field: string): string {
  const identifier = requiredString(value, field, 128);
  if (!IDENTIFIER.test(identifier)) {
    fail(field, "solo admite letras, números, punto, guion, guion bajo y dos puntos");
  }
  return identifier;
}

function isProtocol(value: unknown): value is FileTransferProtocol {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FILEZILLA_PROTOCOL_CODES, value);
}

export function validateFtpHost(value: unknown): string {
  const host = requiredString(value, "connection.host", 253);
  if (/[\s/@\\?#]/.test(host) || host.includes("[") || host.includes("]") || host.includes("://")) {
    fail("connection.host", "debe contener solamente el host, sin protocolo, puerto, usuario ni ruta");
  }

  if (host.includes(":")) {
    if (!/^[0-9A-Fa-f:.]+$/.test(host)) fail("connection.host", "dirección IPv6 no válida");
    try {
      const parsed = new URL(`http://[${host}]/`);
      if (!parsed.hostname) fail("connection.host", "dirección IPv6 no válida");
    } catch {
      fail("connection.host", "dirección IPv6 no válida");
    }
    return host.toLowerCase();
  }

  if (/^[0-9.]+$/.test(host)) {
    const octets = host.split(".");
    if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
      fail("connection.host", "dirección IPv4 no válida");
    }
    return octets.map((part) => String(Number(part))).join(".");
  }

  const labels = host.split(".");
  if (labels.some((label) => !HOST_LABEL.test(label))) {
    fail("connection.host", "nombre de host no válido; usa dominio ASCII o punycode");
  }
  return host.toLowerCase();
}

function validatePort(value: unknown, protocol: FileTransferProtocol): number {
  if (value === undefined) return FILEZILLA_DEFAULT_PORTS[protocol];
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 65_535) {
    fail("connection.port", "debe ser un entero entre 1 y 65535");
  }
  return Number(value);
}

function validateAbsolutePath(value: unknown, field: string, allowRoot: boolean): string {
  const path = requiredString(value, field, 4096);
  if (!path.startsWith("/")) fail(field, "debe ser una ruta absoluta que comience con /");
  if (path.includes("\\")) fail(field, "debe usar / y no barras invertidas");
  if (!allowRoot && path === "/") fail(field, "debe apuntar a un archivo");
  if (path !== "/" && path.endsWith("/")) fail(field, "no puede terminar con /");

  const segments = path === "/" ? [] : path.slice(1).split("/");
  for (const segment of segments) {
    if (!segment) fail(field, "no puede contener segmentos vacíos ni //");
    if (segment === "." || segment === "..") fail(field, "no puede contener . ni ..");
    if (Array.from(segment).length > 255) fail(field, "contiene un segmento de más de 255 caracteres");
  }
  return path;
}

export function validateRemoteDirectory(value: unknown): string {
  return validateAbsolutePath(value, "file.remoteDirectory", true);
}

export function validateRemoteFileName(value: unknown): string {
  const name = requiredString(value, "file.remoteName", 1024);
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    fail("file.remoteName", "debe ser un nombre de archivo, sin ruta");
  }
  return name;
}

export function validateLocalFilePath(value: unknown): string {
  return validateAbsolutePath(value, "file.localFile", false);
}

function isPathInside(root: string, candidate: string): boolean {
  return root === "/" ? candidate.startsWith("/") : candidate === root || candidate.startsWith(`${root}/`);
}

function joinRemotePath(directory: string, name: string): string {
  return directory === "/" ? `/${name}` : `${directory}/${name}`;
}

function relativeLocalPath(root: string, file: string): string {
  return root === "/" ? file.slice(1) : file.slice(root.length + 1);
}

/**
 * APFS/HFS+ commonly compare filenames case-insensitively and macOS also treats
 * canonically equivalent Unicode spellings as the same destination. Windows is
 * case-insensitive by default. Use a conservative shared key so a portable job
 * cannot silently overwrite either file on those systems.
 */
function localDestinationCollisionKey(file: string): string {
  return file.normalize("NFC").toUpperCase().toLowerCase().normalize("NFC");
}

export function escapeXml(value: string): string {
  if (typeof value !== "string") fail("xml", "debe ser texto");
  assertValidXmlText(value, "xml");
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Serializes a canonical absolute UNIX FTP directory using FileZilla's
 * CServerPath safe-path format: type 1 (UNIX), empty prefix, then
 * character-counted path segments.
 */
export function encodeFileZillaUnixRemotePath(value: unknown): string {
  const path = validateRemoteDirectory(value);
  if (path === "/") return "1 0";
  return `1 0 ${path.slice(1).split("/").map((segment) => `${Array.from(segment).length} ${segment}`).join(" ")}`;
}

export function calibrateFileZilla3QueueTemplate(input: FileZilla3QueueTemplate): FileZilla3QueueTemplate {
  if (!input || typeof input !== "object") fail("template", "debe ser un objeto");
  const version = requiredString(input.version, "template.version", 32);
  if (!FILEZILLA_VERSION.test(version)) fail("template.version", "debe ser una versión FileZilla 3.x");
  if (!(["mac", "windows", "linux"] as const).includes(input.platform)) {
    fail("template.platform", "debe ser mac, windows o linux");
  }
  return Object.freeze({ version, platform: input.platform });
}

interface ValidatedInput {
  connection: Required<Pick<FileZillaConnection, "profileId" | "protocol" | "host" | "port" | "username" | "remoteRoot">> & { label: string };
  localRoot: string;
  files: Array<Required<Pick<FileZillaQueueFile, "id" | "remoteDirectory" | "remoteName" | "localFile">> & { sizeBytes?: number }>;
}

function validateInput(input: FileZillaQueueInput): ValidatedInput {
  if (!input || typeof input !== "object") fail("input", "debe ser un objeto");
  if (!input.connection || typeof input.connection !== "object") fail("connection", "debe ser un objeto");
  assertNoCredentialFields(input.connection, "connection");

  if (!isProtocol(input.connection.protocol)) fail("connection.protocol", "protocolo no compatible");
  const profileId = validateIdentifier(input.connection.profileId, "connection.profileId");
  const host = validateFtpHost(input.connection.host);
  const port = validatePort(input.connection.port, input.connection.protocol);
  const username = requiredString(input.connection.username, "connection.username", 256);
  const remoteRoot = validateAbsolutePath(input.connection.remoteRoot ?? "/", "connection.remoteRoot", true);
  const label = input.connection.label === undefined
    ? `TrackHunt ${host}`
    : requiredString(input.connection.label, "connection.label", 256);
  const localRoot = validateAbsolutePath(input.localRoot, "localRoot", true);

  if (!Array.isArray(input.files) || input.files.length === 0) fail("files", "debe contener al menos un archivo");
  if (input.files.length > 10_000) fail("files", "no puede superar 10000 archivos");

  const ids = new Set<string>();
  const remotePaths = new Set<string>();
  const localDestinations = new Set<string>();
  const files = input.files.map((file, index) => {
    const field = `files[${index}]`;
    if (!file || typeof file !== "object") fail(field, "debe ser un objeto");
    const id = validateIdentifier(file.id, `${field}.id`);
    if (ids.has(id)) fail(`${field}.id`, "está repetido");
    ids.add(id);

    const remoteDirectory = validateAbsolutePath(file.remoteDirectory, `${field}.remoteDirectory`, true);
    const remoteName = requiredString(file.remoteName, `${field}.remoteName`, 1024);
    if (remoteName === "." || remoteName === ".." || remoteName.includes("/") || remoteName.includes("\\")) {
      fail(`${field}.remoteName`, "debe ser un nombre de archivo, sin ruta");
    }
    if (!isPathInside(remoteRoot, remoteDirectory)) {
      fail(`${field}.remoteDirectory`, "queda fuera de connection.remoteRoot");
    }
    const remotePath = joinRemotePath(remoteDirectory, remoteName);
    if (remotePaths.has(remotePath)) fail(`${field}.remoteName`, "la ruta remota está repetida");
    remotePaths.add(remotePath);

    const localFile = validateAbsolutePath(file.localFile, `${field}.localFile`, false);
    if (!isPathInside(localRoot, localFile) || localFile === localRoot) {
      fail(`${field}.localFile`, "queda fuera de localRoot");
    }
    const localDestination = localDestinationCollisionKey(localFile);
    if (localDestinations.has(localDestination)) {
      fail(`${field}.localFile`, "colisiona con otro destino local en macOS o Windows");
    }
    localDestinations.add(localDestination);

    let sizeBytes: number | undefined;
    if (file.sizeBytes !== undefined) {
      if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0) {
        fail(`${field}.sizeBytes`, "debe ser un entero seguro mayor o igual a cero");
      }
      sizeBytes = file.sizeBytes;
    }
    return { id, remoteDirectory, remoteName, localFile, sizeBytes };
  });

  return {
    connection: { profileId, protocol: input.connection.protocol, host, port, username, remoteRoot, label },
    localRoot,
    files,
  };
}

/**
 * Generates an importable FileZilla 3.x queue. The native FileZilla 3.69.6
 * export represents a queued binary download with Flags=16. We also emit the
 * backwards-compatible Download/DataType fields that the current 3.x importer
 * still reads, making the direction explicit without ever selecting ASCII.
 * It never emits Pass, Keyfile, token, cookie or other credential fields.
 */
export function generateFileZillaQueueXml(input: FileZillaQueueInput): string {
  const validated = validateInput(input);
  const template = calibrateFileZilla3QueueTemplate(input.template ?? FILEZILLA_3X_MAC_QUEUE_TEMPLATE);
  const protocolCode = FILEZILLA_PROTOCOL_CODES[validated.connection.protocol];
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
    `<FileZilla3 version="${escapeXml(template.version)}" platform="${escapeXml(template.platform)}">`,
    "  <Queue>",
    "    <Server>",
    `      <Host>${escapeXml(validated.connection.host)}</Host>`,
    `      <Port>${validated.connection.port}</Port>`,
    `      <Protocol>${protocolCode}</Protocol>`,
    "      <Type>0</Type>",
    `      <User>${escapeXml(validated.connection.username)}</User>`,
    "      <Logontype>2</Logontype>",
    "      <TimezoneOffset>0</TimezoneOffset>",
    "      <PasvMode>MODE_DEFAULT</PasvMode>",
    "      <MaximumMultipleConnections>0</MaximumMultipleConnections>",
    "      <EncodingType>Auto</EncodingType>",
    "      <BypassProxy>0</BypassProxy>",
    `      <Name>${escapeXml(validated.connection.label)}</Name>`,
  ];

  for (const file of validated.files) {
    lines.push(
      "      <File>",
      `        <LocalFile>${escapeXml(file.localFile)}</LocalFile>`,
      `        <RemoteFile>${escapeXml(file.remoteName)}</RemoteFile>`,
      `        <RemotePath>${escapeXml(encodeFileZillaUnixRemotePath(file.remoteDirectory))}</RemotePath>`,
      "        <Flags>16</Flags>",
      "        <Download>1</Download>",
    );
    if (file.sizeBytes !== undefined) lines.push(`        <Size>${file.sizeBytes}</Size>`);
    lines.push("        <DataType>1</DataType>", "      </File>");
  }

  lines.push("    </Server>", "  </Queue>", "</FileZilla3>");
  const xml = `${lines.join("\n")}\n`;
  if (/<\s*(?:Pass|Keyfile|Token|Secret|Credentials?)\b/i.test(xml)) {
    fail("xml", "se detectó accidentalmente un campo de credencial");
  }
  return xml;
}

export function buildTrackHuntJob(input: TrackHuntJobInput): TrackHuntDownloadJob {
  const validated = validateInput(input);
  const jobId = validateIdentifier(input.jobId, "jobId");
  const created = input.createdAt === undefined ? new Date() : new Date(input.createdAt);
  if (Number.isNaN(created.getTime())) fail("createdAt", "fecha no válida");

  return {
    kind: "trackhunt.download-job",
    version: 1,
    jobId,
    createdAt: created.toISOString(),
    connection: {
      profileId: validated.connection.profileId,
      protocol: validated.connection.protocol,
      host: validated.connection.host,
      port: validated.connection.port,
      remoteRoot: validated.connection.remoteRoot,
    },
    files: validated.files.map((file) => ({
      id: file.id,
      remotePath: joinRemotePath(file.remoteDirectory, file.remoteName),
      destinationRelativePath: relativeLocalPath(validated.localRoot, file.localFile),
      ...(file.sizeBytes === undefined ? {} : { sizeBytes: file.sizeBytes }),
    })),
  };
}

/** Returns the UTF-8 JSON contents intended for a .trackhuntjob file. */
export function generateTrackHuntJob(input: TrackHuntJobInput): string {
  const job = buildTrackHuntJob(input);
  const json = `${JSON.stringify(job, null, 2)}\n`;
  if (/"(?:password|pass|secret|token|keyfile|privateKey|credentials?)"\s*:/i.test(json)) {
    fail("manifest", "se detectó accidentalmente un campo de credencial");
  }
  return json;
}
