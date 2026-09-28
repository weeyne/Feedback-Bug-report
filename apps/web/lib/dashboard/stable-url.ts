export interface StableUrl {
  src: string;
  since: number;
}

const pathOf = (url: string) => url.split('?')[0];

/** Keeps a signed URL steady while it is still valid, so a re-render does not reload the image. */
export function stableUrl(
  current: StableUrl | null,
  incoming: string,
  now: number,
  keepMs: number,
): StableUrl {
  if (current && now - current.since < keepMs && pathOf(current.src) === pathOf(incoming)) {
    return current;
  }
  return { src: incoming, since: now };
}
