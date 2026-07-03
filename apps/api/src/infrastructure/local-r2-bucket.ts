import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type LocalR2PutOptions = {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
};

type LocalR2Metadata = {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
};

export function createLocalR2Bucket(rootDirectory: string): R2Bucket {
  return new LocalR2Bucket(rootDirectory) as unknown as R2Bucket;
}

class LocalR2Bucket {
  constructor(private readonly rootDirectory: string) {}

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null,
    options: LocalR2PutOptions = {}
  ) {
    const filePath = this.filePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(await valueToArrayBuffer(value)));
    await writeFile(
      this.metadataPath(key),
      JSON.stringify(
        {
          httpMetadata: options.httpMetadata,
          customMetadata: options.customMetadata
        } satisfies LocalR2Metadata,
        null,
        2
      )
    );

    return null;
  }

  async get(key: string) {
    const filePath = this.filePath(key);
    let data: Buffer;
    try {
      data = await readFile(filePath);
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }
      throw error;
    }

    const metadata = await this.readMetadata(key);
    return {
      key,
      version: "",
      size: data.byteLength,
      etag: "",
      httpEtag: "",
      uploaded: new Date(),
      checksums: {},
      httpMetadata: metadata.httpMetadata ?? {},
      customMetadata: metadata.customMetadata ?? {},
      range: undefined,
      body: readableStreamFromBuffer(data)
    };
  }

  async delete(key: string) {
    await Promise.all([
      rm(this.filePath(key), { force: true }),
      rm(this.metadataPath(key), { force: true })
    ]);
  }

  private async readMetadata(key: string): Promise<LocalR2Metadata> {
    try {
      return JSON.parse(await readFile(this.metadataPath(key), "utf8")) as LocalR2Metadata;
    } catch (error) {
      if (isMissingFileError(error)) {
        return {};
      }
      throw error;
    }
  }

  private filePath(key: string): string {
    return path.join(this.rootDirectory, ...safeKeySegments(key));
  }

  private metadataPath(key: string): string {
    return `${this.filePath(key)}.metadata.json`;
  }
}

async function valueToArrayBuffer(
  value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null
): Promise<ArrayBuffer> {
  if (value === null) {
    return new ArrayBuffer(0);
  }

  if (typeof value === "string") {
    return new TextEncoder().encode(value).buffer;
  }

  if (value instanceof Blob) {
    return value.arrayBuffer();
  }

  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    const arrayBuffer = new ArrayBuffer(value.byteLength);
    new Uint8Array(arrayBuffer).set(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    );
    return arrayBuffer;
  }

  return new Response(value).arrayBuffer();
}

function readableStreamFromBuffer(data: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(data));
      controller.close();
    }
  });
}

function safeKeySegments(key: string): string[] {
  const segments = key.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Invalid local R2 object key: ${key}`);
  }

  return segments.map((segment) => encodeURIComponent(segment));
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
