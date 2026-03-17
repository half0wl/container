import { describe, expect, it, vi } from "vitest";
import { getPropertyDescriptorFromChain, wrapWithTracing } from "./helpers.js";

describe("getPropertyDescriptorFromChain", () => {
  it("finds a descriptor on the immediate prototype", () => {
    class A {
      foo() {
        return "a";
      }
    }
    const desc = getPropertyDescriptorFromChain(
      A.prototype,
      "foo",
      Object.prototype,
    );
    expect(desc).toBeDefined();
    expect(desc?.value).toBe(A.prototype.foo);
  });

  it("finds a descriptor on a parent prototype", () => {
    class A {
      foo() {
        return "a";
      }
    }
    class B extends A {}
    const desc = getPropertyDescriptorFromChain(
      B.prototype,
      "foo",
      Object.prototype,
    );
    expect(desc).toBeDefined();
    expect(desc?.value).toBe(A.prototype.foo);
  });

  it("stops at the stopAt prototype", () => {
    class A {
      foo() {
        return "a";
      }
    }
    class B extends A {}
    // Stop at A.prototype, so foo (defined on A.prototype) should not be found
    // when starting from B.prototype
    const desc = getPropertyDescriptorFromChain(
      B.prototype,
      "foo",
      A.prototype,
    );
    expect(desc).toBeUndefined();
  });

  it("returns undefined for nonexistent properties", () => {
    class A {}
    const desc = getPropertyDescriptorFromChain(
      A.prototype,
      "nope",
      Object.prototype,
    );
    expect(desc).toBeUndefined();
  });

  it("finds getters/setters", () => {
    class A {
      get bar() {
        return 42;
      }
    }
    const desc = getPropertyDescriptorFromChain(
      A.prototype,
      "bar",
      Object.prototype,
    );
    expect(desc).toBeDefined();
    expect(typeof desc?.get).toBe("function");
    expect(desc?.value).toBeUndefined();
  });
});

describe("wrapWithTracing", () => {
  class StopClass {}

  class Parent extends StopClass {
    parentMethod() {
      return "parent";
    }
  }

  class Child extends Parent {
    childMethod() {
      return "child";
    }
    get myGetter() {
      return "getter-value";
    }
  }

  it("wraps all methods up to stopAt", () => {
    const trace = vi.fn((_name: string, fn: () => unknown) => fn());
    const instance = new Child();
    wrapWithTracing(instance, trace, StopClass.prototype);

    instance.childMethod();
    expect(trace).toHaveBeenCalledWith(
      "Child.childMethod",
      expect.any(Function),
    );

    instance.parentMethod();
    expect(trace).toHaveBeenCalledWith(
      "Child.parentMethod",
      expect.any(Function),
    );
  });

  it("preserves method return values", () => {
    const trace = vi.fn((_name: string, fn: () => unknown) => fn());
    const instance = new Child();
    wrapWithTracing(instance, trace, StopClass.prototype);
    expect(instance.childMethod()).toBe("child");
    expect(instance.parentMethod()).toBe("parent");
  });

  it("preserves method arguments", () => {
    class WithArgs extends StopClass {
      add(a: number, b: number) {
        return a + b;
      }
    }
    const trace = vi.fn((_name: string, fn: () => unknown) => fn());
    const instance = new WithArgs();
    wrapWithTracing(instance, trace, StopClass.prototype);
    expect(instance.add(3, 4)).toBe(7);
  });

  it("skips getters/setters", () => {
    const trace = vi.fn((_name: string, fn: () => unknown) => fn());
    const instance = new Child();
    wrapWithTracing(instance, trace, StopClass.prototype);
    // Getter should still work normally, not wrapped
    expect(instance.myGetter).toBe("getter-value");
    // trace should only have been called for methods, not the getter
    const traceNames = trace.mock.calls.map((c) => c[0]);
    expect(traceNames).not.toContain("Child.myGetter");
  });

  it("skips constructor", () => {
    const trace = vi.fn((_name: string, fn: () => unknown) => fn());
    const instance = new Child();
    wrapWithTracing(instance, trace, StopClass.prototype);
    // constructor should not be in any trace call
    const traceNames = trace.mock.calls.map((c) => c[0]);
    expect(traceNames).not.toContain("Child.constructor");
  });

  it("does not wrap the same method name twice (closest wins)", () => {
    class Base extends StopClass {
      greet() {
        return "base";
      }
    }
    class Override extends Base {
      greet() {
        return "override";
      }
    }
    const trace = vi.fn((_name: string, fn: () => unknown) => fn());
    const instance = new Override();
    wrapWithTracing(instance, trace, StopClass.prototype);
    expect(instance.greet()).toBe("override");
    // Called once, using the override version
    const greetCalls = trace.mock.calls.filter(
      (c) => c[0] === "Override.greet",
    );
    expect(greetCalls).toHaveLength(1);
  });

  it("propagates sync errors", () => {
    class Failing extends StopClass {
      boom() {
        throw new Error("fail");
      }
    }
    const trace = vi.fn((_name: string, fn: () => unknown) => fn());
    const instance = new Failing();
    wrapWithTracing(instance, trace, StopClass.prototype);
    expect(() => instance.boom()).toThrow("fail");
  });

  it("propagates async errors", async () => {
    class AsyncFailing extends StopClass {
      async boom() {
        throw new Error("async-fail");
      }
    }
    const trace = vi.fn((_name: string, fn: () => unknown) => fn());
    const instance = new AsyncFailing();
    wrapWithTracing(instance, trace, StopClass.prototype);
    await expect(instance.boom()).rejects.toThrow("async-fail");
  });

  it("preserves this context in wrapped methods", () => {
    class WithState extends StopClass {
      value = 42;
      getVal() {
        return this.value;
      }
    }
    const trace = vi.fn((_name: string, fn: () => unknown) => fn());
    const instance = new WithState();
    wrapWithTracing(instance, trace, StopClass.prototype);
    expect(instance.getVal()).toBe(42);
  });

  it("uses the instance's constructor name for span names", () => {
    const trace = vi.fn((_name: string, fn: () => unknown) => fn());
    const instance = new Child();
    wrapWithTracing(instance, trace, StopClass.prototype);
    instance.childMethod();
    expect(trace.mock.calls[0][0]).toBe("Child.childMethod");
  });

  it("passes an async callback to trace for async methods", async () => {
    class WithAsync extends StopClass {
      async fetchData() {
        return "data";
      }
      syncMethod() {
        return "sync";
      }
    }
    const callbacks: Array<{ name: string; isAsync: boolean }> = [];
    const trace = vi.fn((name: string, fn: () => unknown) => {
      callbacks.push({
        name,
        isAsync: fn.constructor.name === "AsyncFunction",
      });
      return fn();
    });
    const instance = new WithAsync();
    wrapWithTracing(instance, trace, StopClass.prototype);

    instance.syncMethod();
    await instance.fetchData();

    const syncCall = callbacks.find((c) => c.name === "WithAsync.syncMethod");
    const asyncCall = callbacks.find((c) => c.name === "WithAsync.fetchData");
    expect(syncCall?.isAsync).toBe(false);
    expect(asyncCall?.isAsync).toBe(true);
  });
});
