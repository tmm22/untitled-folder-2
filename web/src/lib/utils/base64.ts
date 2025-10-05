const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeBase64(data: Uint8Array): string {
  if (typeof Buffer !== 'undefined' && typeof window === 'undefined') {
    return Buffer.from(data).toString('base64');
  }

  let binary = '';
  data.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined' && typeof window === 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeString(value: string): Uint8Array {
  return textEncoder.encode(value);
}

export function decodeToString(data: Uint8Array): string {
  return textDecoder.decode(data);
}
