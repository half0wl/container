import {
  BaseService,
  type Constructor,
  type ContainerConfig,
  type IContainer,
  type ServiceDependencies,
} from "./base.js";
import { TRACED_MARKER } from "./decorators.js";
import { wrapWithTracing } from "./helpers.js";

/**
 * A dependency injection container that lazily creates and caches singleton service instances.
 *
 * Supports both a global singleton (via {@link Container.getGlobalInstance}) and
 * isolated instances (via {@link Container.create}) for test environments.
 *
 * @typeParam TDeps - User-defined dependency interface
 *
 * @example
 * ```ts
 * // Production usage
 * const container = Container.create<ContainerDeps>({ db, logger });
 * const auth = container.get(AuthService);
 *
 * // Test usage (isolated)
 * const testContainer = Container.create<ContainerDeps>({ db: mockDb, logger: mockLogger });
 * testContainer.register(UserService, mockUserService);
 * const auth = testContainer.get(AuthService);
 * ```
 */
export class Container<TDeps = unknown> implements IContainer {
  private static globalInstance: Container<unknown> | undefined;

  private instances = new Map<Constructor, unknown>();
  private deps: TDeps | undefined;
  private config: ContainerConfig<TDeps>;

  private constructor(config: ContainerConfig<TDeps> = {}) {
    this.config = config;
    this.deps = config.deps;
  }

  /**
   * Create a new container instance.
   *
   * Accepts either a plain deps object or a {@link ContainerConfig} with
   * additional options like `trace`.
   * When called with no arguments, the container defers resolution
   * until {@link setDeps} is called.
   *
   * @typeParam TDeps - User-defined dependency interface
   * @param depsOrConfig - Dependencies or full configuration object
   * @returns A new isolated container instance
   *
   * @example
   * ```ts
   * // Simple — pass deps directly
   * const container = Container.create<ContainerDeps>({ db, logger });
   *
   * // With config — pass options alongside deps
   * const container = Container.create<ContainerDeps>({
   *   deps: { db, logger },
   *   trace: (spanName, fn) => tracer.startActiveSpan(spanName, () => fn()),
   * });
   *
   * // Lazy — set deps later
   * const container = Container.create<ContainerDeps>();
   * container.setDeps({ db, logger });
   * ```
   */
  static create<TDeps>(
    depsOrConfig?: TDeps | ContainerConfig<TDeps>,
  ): Container<TDeps> {
    if (
      depsOrConfig &&
      typeof depsOrConfig === "object" &&
      ("deps" in depsOrConfig || "trace" in depsOrConfig)
    ) {
      return new Container<TDeps>(depsOrConfig as ContainerConfig<TDeps>);
    }
    return new Container<TDeps>({
      deps: depsOrConfig as TDeps | undefined,
    });
  }

  /**
   * Get the global singleton container instance.
   *
   * Creates one on first call. Useful for module-level exports that
   * need a container reference before deps are available.
   *
   * @typeParam TDeps - User-defined dependency interface
   * @returns The global container instance
   */
  static getGlobalInstance<TDeps>(): Container<TDeps> {
    if (!Container.globalInstance) {
      Container.globalInstance = new Container<TDeps>();
    }
    return Container.globalInstance as Container<TDeps>;
  }

  /**
   * Reset the global singleton container.
   *
   * Clears all cached instances and removes the global reference.
   * Primarily used for test cleanup.
   */
  static resetGlobal(): void {
    Container.globalInstance?.clear();
    Container.globalInstance = undefined;
  }

  /**
   * Set or replace the dependencies after container creation.
   *
   * Useful for lazy initialization patterns where the container
   * is created before deps are available.
   *
   * @param deps - The user-defined dependencies
   */
  setDeps(deps: TDeps): void {
    this.deps = deps;
  }

  /**
   * Resolve a service by its class constructor.
   *
   * On first call, lazily constructs the service with `{ ...deps, registry: this }`
   * and caches the singleton. Subsequent calls return the cached instance.
   *
   * If the service was decorated with `@Service({ trace: true })`, all its methods
   * are automatically wrapped with the configured `trace` function.
   *
   * @typeParam T - The service type
   * @param serviceClass - The class constructor to resolve
   * @returns The singleton instance
   * @throws If deps have not been set
   * @throws If the service has tracing enabled but no `trace` function was configured
   */
  get<T>(serviceClass: Constructor<T>): T {
    const existing = this.instances.get(serviceClass);
    if (existing) return existing as T;

    if (!this.deps) {
      throw new Error(
        "Container deps not set. Call setDeps() or pass deps to Container.create().",
      );
    }

    const serviceDeps: ServiceDependencies<TDeps> = {
      ...this.deps,
      registry: this,
    };

    const instance = new serviceClass(serviceDeps);

    // Apply tracing if @Service({ trace: true }) was used
    if ((serviceClass as unknown as Record<symbol, unknown>)[TRACED_MARKER]) {
      if (!this.config.trace) {
        throw new Error(
          `Service "${serviceClass.name}" has trace enabled but no trace function was provided. Pass { trace } to Container.create().`,
        );
      }
      wrapWithTracing(
        instance as object,
        this.config.trace,
        BaseService.prototype,
      );
    }

    this.instances.set(serviceClass, instance);
    return instance;
  }

  /**
   * Register a pre-built instance for a service class.
   *
   * The registered instance is returned by {@link get} without constructing.
   * Primarily used for injecting test mocks.
   *
   * @typeParam T - The service type
   * @param serviceClass - The class constructor to associate with the instance
   * @param instance - The pre-built instance to register
   *
   * @example
   * ```ts
   * const testContainer = Container.create<ContainerDeps>({ db: mockDb, logger: mockLogger });
   * testContainer.register(UserService, mockUserService);
   * const auth = testContainer.get(AuthService); // uses mockUserService via @Inject
   * ```
   */
  register<T>(serviceClass: Constructor<T>, instance: T): void {
    this.instances.set(serviceClass, instance);
  }

  /**
   * Clear all cached service instances.
   *
   * After calling this, the next {@link get} call for any service
   * will construct a fresh instance. Does not clear deps or config.
   */
  clear(): void {
    this.instances.clear();
  }
}
