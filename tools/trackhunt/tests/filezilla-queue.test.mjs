import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/filezilla-queue.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const queue = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const fixture = () => ({
  connection: {
    profileId: "dj-compilations-main",
    label: "DJ & Pool <principal>",
    protocol: "ftps-explicit",
    host: "FTP.Example.com",
    username: "dj&user",
    remoteRoot: "/Releases",
  },
  localRoot: "/Music/TrackHunt",
  files: [{
    id: "track-001",
    remoteDirectory: "/Releases/2026 & Más/10 Octubre",
    remoteName: 'A&B <Club> "Mix".mp3',
    localFile: '/Music/TrackHunt/A&B <Club> "Mix".mp3',
    sizeBytes: 12_345_678,
  }],
});

test("escapes XML and emits a password-prompt FileZilla 3.x download queue", () => {
  const xml = queue.generateFileZillaQueueXml(fixture());

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8" standalone="yes" \?>/);
  assert.match(xml, /<FileZilla3 version="3\.69\.6" platform="mac">/);
  assert.match(xml, /<Host>ftp\.example\.com<\/Host>/);
  assert.match(xml, /<Port>21<\/Port>/);
  assert.match(xml, /<Protocol>4<\/Protocol>/);
  assert.match(xml, /<User>dj&amp;user<\/User>/);
  assert.match(xml, /<Logontype>2<\/Logontype>/);
  assert.match(xml, /<Name>DJ &amp; Pool &lt;principal&gt;<\/Name>/);
  assert.match(xml, /<RemoteFile>A&amp;B &lt;Club&gt; &quot;Mix&quot;\.mp3<\/RemoteFile>/);
  assert.match(xml, /<RemotePath>1 0 8 Releases 10 2026 &amp; Más 10 10 Octubre<\/RemotePath>/);
  assert.match(xml, /<Flags>16<\/Flags>/);
  assert.match(xml, /<Download>1<\/Download>/);
  assert.match(xml, /<DataType>1<\/DataType>/);
  assert.match(xml, /<Size>12345678<\/Size>/);
  assert.doesNotMatch(xml, /<\s*(?:Pass|Keyfile|Token|Secret|Credentials?)\b/i);
});

test("encodes canonical FileZilla UNIX safe paths including Unicode code points", () => {
  assert.equal(queue.encodeFileZillaUnixRemotePath("/"), "1 0");
  assert.equal(queue.encodeFileZillaUnixRemotePath("/Sets/🔥 Mix"), "1 0 4 Sets 5 🔥 Mix");
});

test("escapes all five XML metacharacters and rejects invalid XML text", () => {
  assert.equal(queue.escapeXml(`&<>"'`), "&amp;&lt;&gt;&quot;&apos;");
  assert.throws(() => queue.escapeXml("bad\u0000value"), /carácter no válido para XML/);
});

test("strictly rejects malformed hosts, traversal, out-of-root files and duplicates", () => {
  for (const host of ["https://ftp.example.com", "user@ftp.example.com", "ftp.example.com/path", "300.1.2.3", "bad_host.test"]) {
    const input = fixture();
    input.connection.host = host;
    assert.throws(() => queue.generateFileZillaQueueXml(input), /connection\.host/);
  }

  assert.equal(queue.validateFtpHost("192.168.001.010"), "192.168.1.10");
  assert.equal(queue.validateFtpHost("2001:DB8::1"), "2001:db8::1");

  for (const remoteDirectory of ["Releases/2026", "/Releases/../Secrets", "/Releases//2026", "/Releases\\2026"]) {
    const input = fixture();
    input.files[0].remoteDirectory = remoteDirectory;
    assert.throws(() => queue.generateFileZillaQueueXml(input), /remoteDirectory/);
  }

  const outsideRemote = fixture();
  outsideRemote.files[0].remoteDirectory = "/AnotherPool/2026";
  assert.throws(() => queue.generateFileZillaQueueXml(outsideRemote), /fuera de connection\.remoteRoot/);

  const outsideLocal = fixture();
  outsideLocal.files[0].localFile = "/Music2/stolen.mp3";
  assert.throws(() => queue.generateFileZillaQueueXml(outsideLocal), /fuera de localRoot/);

  const duplicate = fixture();
  duplicate.files.push({ ...duplicate.files[0], id: "track-002", localFile: "/Music/TrackHunt/copy.mp3" });
  assert.throws(() => queue.generateFileZillaQueueXml(duplicate), /ruta remota está repetida/);
});

test("rejects credential-bearing connection objects instead of silently copying secrets", () => {
  for (const [field, value] of [["password", "hunter2"], ["token", "abc"], ["privateKey", "secret-key"]]) {
    const input = fixture();
    input.connection[field] = value;
    assert.throws(() => queue.generateFileZillaQueueXml(input), /credenciales no pueden formar parte/);
  }
});

test("rejects identical local destinations before generating a queue", () => {
  const input = fixture();
  input.files.push({
    ...input.files[0],
    id: "track-002",
    remoteName: "Another Remix.mp3",
  });
  assert.throws(
    () => queue.generateFileZillaQueueXml(input),
    /colisiona con otro destino local en macOS o Windows/,
  );
});

test("rejects case-insensitive local destination collisions on macOS and Windows", () => {
  const input = fixture();
  input.files[0].localFile = "/Music/TrackHunt/Straße Remix.MP3";
  input.files.push({
    ...input.files[0],
    id: "track-002",
    remoteName: "Another Remix.mp3",
    localFile: "/Music/TrackHunt/STRASSE remix.mp3",
  });
  assert.throws(
    () => queue.generateTrackHuntJob({ ...input, jobId: "case-collision" }),
    /colisiona con otro destino local en macOS o Windows/,
  );
});

test("rejects NFC and NFD spellings that resolve to the same macOS destination", () => {
  const input = fixture();
  input.files[0].localFile = "/Music/TrackHunt/Café Remix.mp3";
  input.files.push({
    ...input.files[0],
    id: "track-002",
    remoteName: "Another Remix.mp3",
    localFile: "/Music/TrackHunt/Cafe\u0301 Remix.mp3",
  });
  assert.throws(
    () => queue.generateFileZillaQueueXml(input),
    /colisiona con otro destino local en macOS o Windows/,
  );
});

test("generates a portable .trackhuntjob manifest without username, local root or credentials", () => {
  const input = {
    ...fixture(),
    jobId: "job:octubre-001",
    createdAt: "2026-10-12T12:34:56-03:00",
  };
  const json = queue.generateTrackHuntJob(input);
  const job = JSON.parse(json);

  assert.deepEqual(job, {
    kind: "trackhunt.download-job",
    version: 1,
    jobId: "job:octubre-001",
    createdAt: "2026-10-12T15:34:56.000Z",
    connection: {
      profileId: "dj-compilations-main",
      protocol: "ftps-explicit",
      host: "ftp.example.com",
      port: 21,
      remoteRoot: "/Releases",
    },
    files: [{
      id: "track-001",
      remotePath: '/Releases/2026 & Más/10 Octubre/A&B <Club> "Mix".mp3',
      destinationRelativePath: 'A&B <Club> "Mix".mp3',
      sizeBytes: 12_345_678,
    }],
  });
  assert.doesNotMatch(json, /dj&user|\/Users\/dj|password|secret|token|privateKey|keyfile/i);
});

test("supports explicit template calibration while rejecting non-3.x templates", () => {
  assert.deepEqual(
    queue.calibrateFileZilla3QueueTemplate({ version: "3.69.3", platform: "mac" }),
    { version: "3.69.3", platform: "mac" },
  );
  assert.throws(
    () => queue.calibrateFileZilla3QueueTemplate({ version: "4.0.0", platform: "mac" }),
    /versión FileZilla 3\.x/,
  );
});
