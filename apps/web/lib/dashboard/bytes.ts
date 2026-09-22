const encoder = new TextEncoder();

/** Byte length as stored by Postgres `octet_length` (UTF-8). Safe in the browser. */
export const utf8ByteLength = (value: string) => encoder.encode(value).length;
