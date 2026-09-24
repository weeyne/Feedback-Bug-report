export type Tool = 'rect' | 'pen' | 'hide';
export type Point = [number, number];
export interface Stroke {
  tool: Tool;
  points: Point[];
}
export interface AnnotateMessages {
  rect: string;
  pen: string;
  hide: string;
  undo: string;
  done: string;
  cancel: string;
  canvas: string;
}
export interface AnnotateInput {
  image: Blob;
  strokes?: Stroke[];
  t: AnnotateMessages;
}
export interface AnnotateResult {
  image: Blob;
  strokes: Stroke[];
}
export type AnnotateFn = (input: AnnotateInput) => Promise<AnnotateResult | null>;
export const ANNOTATION_COLOR = '#FF3B30';
export const HIDE_COLOR = '#111';
export const STROKE_WIDTH = 3;
