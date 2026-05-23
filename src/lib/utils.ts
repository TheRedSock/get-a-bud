import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Type-level guard for client component props that receive data from Server
 * Components. Rejects function-typed values at the top level since they cannot
 * be serialized across the RSC boundary.
 *
 * Apply this to props interfaces of "use client" components that are rendered
 * by server component pages:
 *
 *   type MyProps = ServerBoundaryProps<{ data: Row[]; onClick: () => void }>
 *   //=> { data: Row[]; onClick: never }  — TypeScript error at call site
 *
 * `ReactNode` and `React.ReactElement` are allowed (they are serializable JSX).
 */
export type ServerBoundaryProps<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown
    ? never
    : T[K];
};
