import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { McpToolError } from '../errors.js';
import { isInside, resolveUserPath } from './paths.js';

/** The server's upload cap (contract `createUpload`: 20 MiB), checked before reading. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';
export interface ImageFile {
  path: string;
  filename: string;
  contentType: ImageType;
  bytes: number;
  data: Uint8Array;
}

const ascii = (b: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...b.subarray(from, to));

function sniff(b: Uint8Array): ImageType | 'heic' | null {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' && ascii(b, 4, 8) === '\r\n\x1a\n')
    return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP')
    return 'image/webp';
  if (
    b.length >= 12 &&
    ascii(b, 4, 8) === 'ftyp' &&
    /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii(b, 8, 12))
  )
    return 'heic';
  return null;
}

/** Spec §9.2: only a regular PNG/JPEG/WebP file of 1 B–20 MiB is read; nothing else leaves. */
export async function readImageFile(
  input: string,
  opts: { root: string | null },
): Promise<ImageFile> {
  const absolute = resolveUserPath(input, opts);
  const real = await realpath(absolute).catch(() => {
    throw new McpToolError(
      'NOT_A_FILE',
      `${absolute} does not exist.`,
      'Pass the absolute path of an existing screenshot file.',
    );
  });
  if (opts.root && !isInside(opts.root, real)) {
    throw new McpToolError(
      'PATH_NOT_ALLOWED',
      `${absolute} resolves outside STORESHOT_MCP_ROOT.`,
      'Use a file inside STORESHOT_MCP_ROOT.',
    );
  }
  const handle = await open(real, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size === 0) {
      throw new McpToolError(
        'NOT_A_FILE',
        `${absolute} is not a non-empty regular file.`,
        'Pass the absolute path of a screenshot file.',
      );
    }
    if (info.size > MAX_UPLOAD_BYTES) {
      throw new McpToolError(
        'FILE_TOO_LARGE',
        `${absolute} is ${info.size} bytes; uploads are at most 20 MiB.`,
        'Export the screenshot as PNG or JPEG under 20 MiB.',
      );
    }
    const data = new Uint8Array(info.size);
    const { bytesRead } = await handle.read(data, 0, info.size, 0);
    const type = sniff(data.subarray(0, Math.min(bytesRead, 16)));
    const name = path.basename(absolute);
    if (type === 'heic') {
      throw new McpToolError(
        'UNSUPPORTED_FILE_TYPE',
        `${name} is HEIC/HEIF: convert it to PNG first; nothing was uploaded.`,
        'Storeshot accepts PNG, JPEG or WebP: convert it to PNG first.',
      );
    }
    if (!type) {
      throw new McpToolError(
        'UNSUPPORTED_FILE_TYPE',
        `${name} is not a PNG, JPEG or WebP image; nothing was uploaded.`,
        'Pass a PNG, JPEG or WebP screenshot.',
      );
    }
    return {
      path: real,
      filename: name,
      contentType: type,
      bytes: bytesRead,
      data: data.subarray(0, bytesRead),
    };
  } finally {
    await handle.close();
  }
}
