import { openEditor } from './editor';
import type { AnnotateFn } from './types';

export const annotate: AnnotateFn = (input) => openEditor(input).catch(() => null);
