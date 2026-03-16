import type { TraceFn } from "./base.js";

/**
 * Walk the prototype chain from `proto` up to (but not including) `stopAt`,
 * looking for a property descriptor with the given key.
 *
 * @param proto - The prototype to start searching from
 * @param key - The property name to look for
 * @param stopAt - The prototype to stop at (exclusive)
 * @returns The property descriptor if found, or `undefined`
 */
export function getPropertyDescriptorFromChain(
  proto: object,
  key: string,
  stopAt: object,
): PropertyDescriptor | undefined {
  let current: object | null = proto;
  while (current && current !== stopAt) {
    const desc = Object.getOwnPropertyDescriptor(current, key);
    if (desc) return desc;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

/**
 * Wrap all methods on an instance with a tracing function.
 *
 * Walks the prototype chain from the instance up to `stopAt`, wrapping
 * every method (functions with a `value` descriptor) with the `trace` callback.
 * Getters, setters, and the constructor are skipped. When a method exists on
 * multiple prototypes in the chain, the closest (most derived) version wins.
 *
 * Span names follow the `ClassName.methodName` format.
 *
 * @param instance - The object instance whose methods will be wrapped
 * @param trace - The tracing function that wraps each method call
 * @param stopAt - The prototype to stop walking at (typically `BaseService.prototype`)
 *
 * @example
 * ```ts
 * wrapWithTracing(instance, (spanName, fn) => {
 *   console.log(`>> ${spanName}`);
 *   const result = fn();
 *   console.log(`<< ${spanName}`);
 *   return result;
 * }, BaseService.prototype);
 * ```
 */
export function wrapWithTracing(
  instance: object,
  trace: TraceFn,
  stopAt: object,
): void {
  const className = instance.constructor.name;
  const seen = new Set<string>();
  let proto: object | null = Object.getPrototypeOf(instance);

  while (proto && proto !== stopAt) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === "constructor" || seen.has(key)) continue;
      seen.add(key);

      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (!desc || !desc.value || typeof desc.value !== "function") continue;

      const original = desc.value as (...args: unknown[]) => unknown;
      const spanName = `${className}.${key}`;

      (instance as Record<string, unknown>)[key] = function (
        this: unknown,
        ...args: unknown[]
      ) {
        return trace(spanName, () => original.apply(this, args));
      };
    }
    proto = Object.getPrototypeOf(proto);
  }
}
