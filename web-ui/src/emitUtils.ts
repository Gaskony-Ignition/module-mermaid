import type { StyleObject } from '@inductiveautomation/perspective-client';

/** Prepends the component's own classes to the user's style classes, keeping the user's inline style. */
export function mergeEmitProps(base: StyleObject | undefined, classes: string[] = []): StyleObject {
  return {
    classes: [...classes, ...(base?.classes ?? [])],
    style: base?.style,
  };
}
