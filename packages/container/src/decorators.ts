import type { Constructor, IContainer } from "./base.js";

/** @internal Symbol used to mark classes decorated with `@Service({ trace: true })`. */
export const TRACED_MARKER = Symbol("__service_traced__");

/**
 * Options for the {@link Service} decorator.
 */
export interface ServiceOptions {
  /**
   * When `true`, all methods on this service are automatically wrapped
   * with the container's `trace` function after construction.
   *
   * Requires a `trace` function in the {@link ContainerConfig}.
   *
   * @defaultValue `false`
   */
  trace?: boolean;
}

/**
 * Class decorator that marks a class as container-managed.
 *
 * When `trace` is enabled, the container will wrap all methods
 * with tracing spans using the configured trace function.
 *
 * Requires `experimentalDecorators: true` in tsconfig.json.
 *
 * @param options - Optional configuration for the service
 * @returns A class decorator
 *
 * @example
 * ```ts
 * @Service()
 * class UserService extends BaseService<ContainerDeps> {
 *   findById(id: string) {
 *     return this.deps.db.users.findUnique({ where: { id } });
 *   }
 * }
 *
 * @Service({ trace: true })
 * class TracedService extends BaseService<ContainerDeps> {
 *   // All methods auto-traced as "TracedService.methodName"
 *   process() { ... }
 * }
 * ```
 */
export function Service(options?: ServiceOptions): ClassDecorator {
  return (target) => {
    if (options?.trace) {
      (target as unknown as Record<symbol, boolean>)[TRACED_MARKER] = true;
    }
    return target;
  };
}

type InjectTarget<T> = { registry: IContainer } & Record<symbol, T>;

/**
 * Property decorator for declarative inter-service dependency injection.
 *
 * Defines a lazy getter that resolves the dependency from the same container
 * on first access and caches it per-instance. Uses a factory function
 * (`() => X` instead of `X` directly) to avoid circular import issues
 * between service files.
 *
 * Requires `experimentalDecorators: true` in tsconfig.json.
 *
 * @typeParam T - The injected service type
 * @param factory - A factory function returning the service class constructor.
 *                  Called lazily on first property access.
 * @returns A property decorator
 *
 * @example
 * ```ts
 * @Service()
 * class AuthService extends BaseService<ContainerDeps> {
 *   @Inject(() => UserService)
 *   declare readonly userService: UserService;
 *
 *   @Inject(() => TokenService)
 *   declare readonly tokenService: TokenService;
 *
 *   authenticate(token: string) {
 *     const payload = this.tokenService.verify(token);
 *     return this.userService.findById(payload.userId);
 *   }
 * }
 * ```
 */
export function Inject<T>(factory: () => Constructor<T>) {
  return (_target: object, propertyKey: string | symbol): void => {
    const cacheKey = Symbol(`__inject_${String(propertyKey)}`);

    Object.defineProperty(_target, propertyKey, {
      get(this: InjectTarget<T>) {
        const cached = this[cacheKey];
        if (cached !== undefined) return cached;
        const resolved = this.registry.get(factory());
        this[cacheKey] = resolved;
        return resolved;
      },
      enumerable: true,
      configurable: true,
    });
  };
}
