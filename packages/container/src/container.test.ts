import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseService } from "./base.js";
import { Container } from "./container.js";
import { Inject, Service } from "./decorators.js";

// --- Shared test deps ---

interface TestDeps {
  db: { users: { findUnique: (q: Record<string, unknown>) => unknown } };
  logger: { info: (msg: string) => void };
}

function makeDeps(): TestDeps {
  return {
    db: {
      users: {
        findUnique: vi.fn((q) => ({ id: q.where.id, name: "Alice" })),
      },
    },
    logger: { info: vi.fn() },
  };
}

@Service()
class UserService extends BaseService<TestDeps> {
  findById(id: string) {
    return this.deps.db.users.findUnique({ where: { id } });
  }
}

@Service()
class AuthService extends BaseService<TestDeps> {
  @Inject(() => UserService)
  declare readonly userService: UserService;

  authenticate(token: string) {
    return this.userService.findById(token);
  }
}

// --- Container.create ---

describe("Container.create", () => {
  it("accepts plain deps object", () => {
    const deps = makeDeps();
    const container = Container.create<TestDeps>(deps);
    const svc = container.get(UserService);
    expect(svc).toBeInstanceOf(UserService);
  });

  it("accepts ContainerConfig object", () => {
    const container = Container.create<TestDeps>({ deps: makeDeps() });
    const svc = container.get(UserService);
    expect(svc).toBeInstanceOf(UserService);
  });

  it("accepts no arguments (lazy init)", () => {
    const container = Container.create<TestDeps>();
    expect(() => container.get(UserService)).toThrow("Container deps not set");
    container.setDeps(makeDeps());
    expect(container.get(UserService)).toBeInstanceOf(UserService);
  });
});

// --- Singleton behavior ---

describe("Container singleton caching", () => {
  let container: Container<TestDeps>;

  beforeEach(() => {
    container = Container.create<TestDeps>(makeDeps());
  });

  it("returns the same instance on repeated .get()", () => {
    const a = container.get(UserService);
    const b = container.get(UserService);
    expect(a).toBe(b);
  });

  it("returns different instances for different service classes", () => {
    const user = container.get(UserService);
    const auth = container.get(AuthService);
    expect(user).not.toBe(auth);
  });
});

// --- Container isolation ---

describe("Container isolation", () => {
  it("different .create() calls produce independent containers", () => {
    const c1 = Container.create<TestDeps>(makeDeps());
    const c2 = Container.create<TestDeps>(makeDeps());
    expect(c1.get(UserService)).not.toBe(c2.get(UserService));
  });
});

// --- register ---

describe("container.register", () => {
  it("substitutes a pre-built instance", () => {
    const container = Container.create<TestDeps>(makeDeps());
    const mock = { findById: vi.fn(() => "mock") } as unknown as UserService;
    container.register(UserService, mock);
    expect(container.get(UserService)).toBe(mock);
  });

  it("register overwrites a previously created instance", () => {
    const container = Container.create<TestDeps>(makeDeps());
    const first = container.get(UserService);
    const mock = { findById: vi.fn() } as unknown as UserService;
    container.register(UserService, mock);
    expect(container.get(UserService)).toBe(mock);
    expect(container.get(UserService)).not.toBe(first);
  });

  it("registered instance is returned without constructing", () => {
    // Container with no deps — would throw on .get() normally
    const container = Container.create<TestDeps>();
    const mock = { findById: vi.fn() } as unknown as UserService;
    container.register(UserService, mock);
    // Should NOT throw even though deps are not set
    expect(container.get(UserService)).toBe(mock);
  });
});

// --- clear ---

describe("container.clear", () => {
  it("resets all cached instances", () => {
    const container = Container.create<TestDeps>(makeDeps());
    const first = container.get(UserService);
    container.clear();
    const second = container.get(UserService);
    expect(first).not.toBe(second);
  });

  it("clears registered instances too", () => {
    const container = Container.create<TestDeps>(makeDeps());
    const mock = { findById: vi.fn() } as unknown as UserService;
    container.register(UserService, mock);
    container.clear();
    const fresh = container.get(UserService);
    expect(fresh).not.toBe(mock);
    expect(fresh).toBeInstanceOf(UserService);
  });
});

// --- setDeps ---

describe("container.setDeps", () => {
  it("enables lazy initialization", () => {
    const container = Container.create<TestDeps>();
    container.setDeps(makeDeps());
    expect(container.get(UserService)).toBeInstanceOf(UserService);
  });

  it("can replace deps (new instances use new deps)", () => {
    const deps1 = makeDeps();
    const deps2 = makeDeps();
    const container = Container.create<TestDeps>(deps1);
    const svc1 = container.get(UserService);
    container.clear();
    container.setDeps(deps2);
    const svc2 = container.get(UserService);
    expect(svc1).not.toBe(svc2);
  });
});

// --- Global instance ---

describe("Container global instance", () => {
  beforeEach(() => {
    Container.resetGlobal();
  });

  it("getGlobalInstance returns the same container", () => {
    const g1 = Container.getGlobalInstance<TestDeps>();
    const g2 = Container.getGlobalInstance<TestDeps>();
    expect(g1).toBe(g2);
  });

  it("resetGlobal creates a new global instance", () => {
    const g1 = Container.getGlobalInstance<TestDeps>();
    Container.resetGlobal();
    const g2 = Container.getGlobalInstance<TestDeps>();
    expect(g1).not.toBe(g2);
  });

  it("resetGlobal clears instances in the old global", () => {
    const g = Container.getGlobalInstance<TestDeps>();
    g.setDeps(makeDeps());
    const svc = g.get(UserService);
    Container.resetGlobal();
    const g2 = Container.getGlobalInstance<TestDeps>();
    g2.setDeps(makeDeps());
    expect(g2.get(UserService)).not.toBe(svc);
  });
});

// --- @Inject through container ---

describe("@Inject via container", () => {
  let deps: TestDeps;

  beforeEach(() => {
    deps = makeDeps();
    Container.resetGlobal();
  });

  it("lazily resolves on first property access", () => {
    const container = Container.create<TestDeps>(deps);
    const auth = container.get(AuthService);
    const us = auth.userService;
    expect(us).toBeInstanceOf(UserService);
  });

  it("caches after first access", () => {
    const container = Container.create<TestDeps>(deps);
    const auth = container.get(AuthService);
    expect(auth.userService).toBe(auth.userService);
  });

  it("resolves from the same container (test isolation)", () => {
    const c1 = Container.create<TestDeps>(deps);
    const c2 = Container.create<TestDeps>(makeDeps());

    const mockUser = {
      findById: vi.fn(() => "from-mock"),
    } as unknown as UserService;
    c2.register(UserService, mockUser);

    const auth1 = c1.get(AuthService);
    const auth2 = c2.get(AuthService);

    expect(auth1.userService).toBeInstanceOf(UserService);
    expect(auth2.userService).toBe(mockUser);
  });

  it("injected service is the same singleton the container holds", () => {
    const container = Container.create<TestDeps>(deps);
    const auth = container.get(AuthService);
    const directUser = container.get(UserService);
    expect(auth.userService).toBe(directUser);
  });
});

// --- @Service({ trace: true }) via container ---

describe("@Service({ trace: true }) via container", () => {
  const traceFn = vi.fn((_name: string, fn: () => unknown) => fn());

  class MiddleService extends BaseService<TestDeps> {
    middle() {
      return "middle";
    }
  }

  @Service({ trace: true })
  class TracedChild extends MiddleService {
    @Inject(() => UserService)
    declare readonly userService: UserService;

    child() {
      return "child";
    }

    async asyncMethod() {
      return "async-result";
    }
  }

  let container: Container<TestDeps>;

  beforeEach(() => {
    traceFn.mockClear();
    Container.resetGlobal();
    container = Container.create<TestDeps>({
      deps: makeDeps(),
      trace: traceFn,
    });
  });

  it("wraps methods with tracing spans", () => {
    const svc = container.get(TracedChild);
    svc.child();
    expect(traceFn).toHaveBeenCalledWith(
      "TracedChild.child",
      expect.any(Function),
    );
  });

  it("wraps inherited methods from intermediate classes", () => {
    const svc = container.get(TracedChild);
    svc.middle();
    expect(traceFn).toHaveBeenCalledWith(
      "TracedChild.middle",
      expect.any(Function),
    );
  });

  it("does not interfere with @Inject getters", () => {
    const svc = container.get(TracedChild);
    const us = svc.userService;
    expect(us).toBeInstanceOf(UserService);
  });

  it("propagates errors through traced methods", () => {
    @Service({ trace: true })
    class FailService extends BaseService<TestDeps> {
      fail() {
        throw new Error("boom");
      }
    }
    const svc = container.get(FailService);
    expect(() => svc.fail()).toThrow("boom");
  });

  it("preserves async return values", async () => {
    const svc = container.get(TracedChild);
    const result = await svc.asyncMethod();
    expect(result).toBe("async-result");
  });

  it("throws if trace function not provided for traced service", () => {
    const noTrace = Container.create<TestDeps>(makeDeps());
    @Service({ trace: true })
    class NeedsTrace extends BaseService<TestDeps> {}
    expect(() => noTrace.get(NeedsTrace)).toThrow("no trace function");
  });

  it("does not wrap methods on non-traced services", () => {
    traceFn.mockClear();
    const svc = container.get(UserService);
    svc.findById("1");
    expect(traceFn).not.toHaveBeenCalled();
  });
});

// --- Generic TDeps ---

describe("Generic TDeps", () => {
  interface MinimalDeps {
    config: { port: number };
  }

  @Service()
  class ConfigService extends BaseService<MinimalDeps> {
    getPort() {
      return this.deps.config.port;
    }
  }

  interface ComplexDeps {
    cache: Map<string, unknown>;
    queue: { push: (item: unknown) => void };
  }

  @Service()
  class QueueService extends BaseService<ComplexDeps> {
    enqueue(item: unknown) {
      this.deps.queue.push(item);
    }
    cached(key: string) {
      return this.deps.cache.get(key);
    }
  }

  it("works with minimal dep shapes", () => {
    const container = Container.create<MinimalDeps>({ config: { port: 3000 } });
    expect(container.get(ConfigService).getPort()).toBe(3000);
  });

  it("works with complex dep shapes", () => {
    const cache = new Map([["key", "value"]]);
    const push = vi.fn();
    const container = Container.create<ComplexDeps>({
      cache,
      queue: { push },
    });
    const svc = container.get(QueueService);
    svc.enqueue("item");
    expect(push).toHaveBeenCalledWith("item");
    expect(svc.cached("key")).toBe("value");
  });
});
