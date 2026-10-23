// The subset of the Perspective client API this component uses. IA publishes no npm typings;
// the runtime object is the PerspectiveClient global, mapped by the webpack externals.
declare module '@inductiveautomation/perspective-client' {
  import { ComponentType } from 'react';

  export interface StyleObject {
    classes?: string[];
    style?: Record<string, unknown>;
  }

  export interface ComponentProps<P> {
    props: P;
    emit: (options?: StyleObject) => Record<string, unknown>;
    store: {
      view?: { page?: { parent?: { isPreviewing?: boolean } } };
      props: {
        write(path: string, value: unknown): void;
      };
    };
  }

  export interface PropertyTree {
    readString(key: string, defaultValue?: string): string;
    readNumber(key: string, defaultValue?: number): number;
    readBoolean(key: string, defaultValue?: boolean): boolean;
    readStyle(key: string): { toEmitProps(): StyleObject };
  }

  export interface SizeObject {
    width: number;
    height: number;
  }

  export interface ComponentMeta {
    getComponentType(): string;
    getViewComponent(): ComponentType<any>;
    getDefaultSize(): SizeObject;
    getPropsReducer(tree: PropertyTree): unknown;
  }

  export const ComponentRegistry: {
    register(component: ComponentMeta): void;
  };
}
