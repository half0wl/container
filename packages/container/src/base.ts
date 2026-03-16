/** A class constructor type. */
// biome-ignore lint/suspicious/noExplicitAny: Constructor must accept any args to be generic over all classes
export type Constructor<T = unknown> = new (...args: any[]) => T;

/** A pluggable tracing function signature. */
export type TraceFn = (spanName: string, fn: () => unknown) => unknown;

/**
 * Minimal interface representing a DI container.
 *
 * Services receive this as `this.registry` to resolve other services
 * without coupling to the full {@link Container} implementation.
 */
export interface IContainer {
  /**
   * Resolve a service by its class constructor.
   *
   * @typeParam T - The service type
   * @param serviceClass - The class constructor to resolve
   * @returns The singleton instance of the service
   */
  get<T>(serviceClass: Constructor<T>): T;
}

/**
 * The full set of dependencies passed to a service constructor.
 *
 * Combines the user-defined `TDeps` with the container's `registry`,
 * which is injected automatically by the container.
 *
 * @typeParam TDeps - User-defined dependency interface
 */
export type ServiceDependencies<TDeps> = TDeps & { registry: IContainer };

/**
 * Configuration object for {@link Container.create}.
 *
 * @typeParam TDeps - User-defined dependency interface
 */
export interface ContainerConfig<TDeps> {
  /** The user-defined dependencies to inject into services. */
  deps?: TDeps;

  /**
   * Optional tracing function for services decorated with `@Service({ trace: true })`.
   * When a traced service is resolved, all its methods are wrapped with this function.
   *
   * @param spanName - The span name in `ClassName.methodName` format
   * @param fn - The original method to execute within the span
   * @returns The return value of `fn`
   *
   * @example
   * ```ts
   * const container = Container.create<ContainerDeps>({
   *   deps: { db, logger },
   *   trace: (spanName, fn) => tracer.startActiveSpan(spanName, () => fn()),
   * });
   * ```
   */
  trace?: TraceFn;
}

/**
 * Abstract base class that all container-managed services extend.
 *
 * Receives injected dependencies via its constructor and exposes them
 * as `this.deps` (user-defined) and `this.registry` (the container).
 *
 * @typeParam TDeps - User-defined dependency interface
 *
 * @example
 * ```ts
 * interface ContainerDeps {
 *   db: DatabaseClient;
 *   logger: Logger;
 * }
 *
 * @Service()
 * class UserService extends BaseService<ContainerDeps> {
 *   findById(id: string) {
 *     return this.deps.db.users.findUnique({ where: { id } });
 *   }
 * }
 * ```
 */
export abstract class BaseService<TDeps = unknown> {
  /** The user-defined dependencies (everything except `registry`). */
  protected readonly deps: TDeps;

  /** The container instance, used internally by {@link Inject} to resolve other services. */
  protected readonly registry: IContainer;

  constructor(dependencies: ServiceDependencies<TDeps>) {
    const { registry, ...rest } = dependencies as ServiceDependencies<TDeps>;
    this.deps = rest as unknown as TDeps;
    this.registry = registry;
  }
}
