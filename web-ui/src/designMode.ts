// Designer integration. Kept apart from the component so the detection can be unit-tested.

export interface DesignerStoreLike {
  view?: { page?: { parent?: { isPreviewing?: boolean } } };
}

/**
 * True on the Designer canvas in design mode. Perspective's own components read this flag:
 * false in design mode, true in Preview, undefined in a session. The component store's
 * isDesigner/isPreviewing are not set in the real Designer, so they cannot be used.
 */
export function isDesignMode(store: DesignerStoreLike | undefined): boolean {
  return store?.view?.page?.parent?.isPreviewing === false;
}

interface InteractionRegistryLike {
  registerInteractionDelegates(delegate: { type: string; isContentEditable: boolean }): void;
}

function interactionRegistry(): InteractionRegistryLike | undefined {
  return (self as unknown as { PerspectiveDesigner?: { InteractionRegistry?: InteractionRegistryLike } })
    .PerspectiveDesigner?.InteractionRegistry;
}

/**
 * In design mode the Designer sets pointer-events:none on everything inside a non-container
 * component. isContentEditable gives input back once the component is deep-selected
 * (double-click), except under `.not-editable`. PerspectiveDesigner exists only on the Designer
 * page, and may load after this bundle, so it is polled for briefly.
 */
export function registerDesignDelegate(type: string): void {
  const tryRegister = (): boolean => {
    const registry = interactionRegistry();
    registry?.registerInteractionDelegates({ type, isContentEditable: true });
    return registry !== undefined;
  };
  if (tryRegister()) {
    return;
  }
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (tryRegister() || attempts >= 50) {
      clearInterval(timer);
    }
  }, 200);
}
