import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Constructor, IContainer } from "./base.js";
import { Inject, Service, TRACED_MARKER } from "./decorators.js";

describe("@Service()", () => {
  it("returns the same class (identity)", () => {
    @Service()
    class MyService {}
    expect(MyService).toBeDefined();
    expect(new MyService()).toBeInstanceOf(MyService);
  });

  it("does not set TRACED_MARKER without options", () => {
    @Service()
    class Plain {}
    expect(
      (Plain as unknown as Record<symbol, unknown>)[TRACED_MARKER],
    ).toBeUndefined();
  });

  it("does not set TRACED_MARKER when trace is false", () => {
    @Service({ trace: false })
    class NoTrace {}
    expect(
      (NoTrace as unknown as Record<symbol, unknown>)[TRACED_MARKER],
    ).toBeUndefined();
  });

  it("sets TRACED_MARKER when trace is true", () => {
    @Service({ trace: true })
    class Traced {}
    expect((Traced as unknown as Record<symbol, unknown>)[TRACED_MARKER]).toBe(
      true,
    );
  });

  it("preserves class prototype chain", () => {
    class Parent {}
    @Service()
    class Child extends Parent {}
    expect(new Child()).toBeInstanceOf(Parent);
  });
});

describe("@Inject()", () => {
  let mockRegistry: IContainer;
  let getCalls: Record<string, unknown>[];

  beforeEach(() => {
    getCalls = [];
    const getMock = vi.fn((cls: Constructor) => {
      const instance = { __mock: cls.name };
      getCalls.push(instance);
      return instance;
    });
    mockRegistry = { get: getMock as unknown as IContainer["get"] };
  });

  function makeInstance<T>(cls: Constructor<T>): T {
    // Simulate what Container does: create with registry on the object
    const instance = Object.create(cls.prototype);
    (instance as unknown as Record<string, unknown>).registry = mockRegistry;
    return instance;
  }

  it("defines a lazy getter on the prototype", () => {
    class Dep {}
    class Host {
      @Inject(() => Dep)
      declare readonly dep: Dep;
    }
    const desc = Object.getOwnPropertyDescriptor(Host.prototype, "dep");
    expect(desc).toBeDefined();
    expect(typeof desc?.get).toBe("function");
  });

  it("resolves from registry on first access", () => {
    class Dep {}
    class Host {
      @Inject(() => Dep)
      declare readonly dep: Dep;
    }
    const host = makeInstance(Host);
    const result = host.dep;
    expect(mockRegistry.get).toHaveBeenCalledWith(Dep);
    expect(result).toEqual({ __mock: "Dep" });
  });

  it("caches the resolved value on subsequent accesses", () => {
    class Dep {}
    class Host {
      @Inject(() => Dep)
      declare readonly dep: Dep;
    }
    const host = makeInstance(Host);
    const first = host.dep;
    const second = host.dep;
    expect(first).toBe(second);
    expect(mockRegistry.get).toHaveBeenCalledTimes(1);
  });

  it("caches per-instance (different instances get separate caches)", () => {
    class Dep {}
    class Host {
      @Inject(() => Dep)
      declare readonly dep: Dep;
    }
    const a = makeInstance(Host);
    const b = makeInstance(Host);
    const depA = a.dep;
    const depB = b.dep;
    expect(depA).not.toBe(depB);
    expect(mockRegistry.get).toHaveBeenCalledTimes(2);
  });

  it("supports multiple @Inject on the same class", () => {
    class DepA {}
    class DepB {}
    class Host {
      @Inject(() => DepA)
      declare readonly a: DepA;
      @Inject(() => DepB)
      declare readonly b: DepB;
    }
    const host = makeInstance(Host);
    const ra = host.a;
    const rb = host.b;
    expect(ra).toEqual({ __mock: "DepA" });
    expect(rb).toEqual({ __mock: "DepB" });
  });

  it("factory function is called lazily (not at decoration time)", () => {
    const factory = vi.fn(() => {
      class LateClass {}
      return LateClass;
    });
    class Host {
      @Inject(factory)
      declare readonly dep: unknown;
    }
    expect(factory).not.toHaveBeenCalled();
    const host = makeInstance(Host);
    host.dep;
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("works with inheritance (child inherits parent's @Inject)", () => {
    class Dep {}
    class Parent {
      @Inject(() => Dep)
      declare readonly dep: Dep;
    }
    class Child extends Parent {}
    const child = makeInstance(Child);
    expect(child.dep).toEqual({ __mock: "Dep" });
  });
});
