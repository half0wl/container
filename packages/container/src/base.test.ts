import { describe, expect, it } from "vitest";
import {
  BaseService,
  type IContainer,
  type ServiceDependencies,
} from "./base.js";

interface TestDeps {
  db: { query: (sql: string) => string };
  logger: { info: (msg: string) => void };
}

const stubContainer: IContainer = { get: () => null as unknown as never };

function makeDeps(): ServiceDependencies<TestDeps> {
  return {
    db: { query: (sql) => `result:${sql}` },
    logger: { info: () => {} },
    registry: stubContainer,
  };
}

class ConcreteService extends BaseService<TestDeps> {
  getDb() {
    return this.deps.db;
  }
  getLogger() {
    return this.deps.logger;
  }
  getRegistry() {
    return this.registry;
  }
}

describe("BaseService", () => {
  it("separates deps from registry", () => {
    const deps = makeDeps();
    const svc = new ConcreteService(deps);
    expect(svc.getDb()).toBe(deps.db);
    expect(svc.getLogger()).toBe(deps.logger);
    expect(svc.getRegistry()).toBe(deps.registry);
  });

  it("deps object does not contain registry", () => {
    const svc = new ConcreteService(makeDeps());
    expect(
      (svc.getDb() as unknown as Record<string, unknown>).registry,
    ).toBeUndefined();
    expect("registry" in svc.getDb()).toBe(false);
  });

  it("works with empty deps interface", () => {
    class EmptyService extends BaseService<Record<string, never>> {
      getDeps() {
        return this.deps;
      }
    }
    const svc = new EmptyService({
      registry: stubContainer,
    } as ServiceDependencies<Record<string, never>>);
    expect(svc.getDeps()).toBeDefined();
  });

  it("preserves all user-defined dep keys", () => {
    interface BigDeps {
      a: number;
      b: string;
      c: boolean;
    }
    class BigService extends BaseService<BigDeps> {
      getDeps() {
        return this.deps;
      }
    }
    const svc = new BigService({
      a: 1,
      b: "two",
      c: true,
      registry: stubContainer,
    });
    expect(svc.getDeps()).toEqual({ a: 1, b: "two", c: true });
  });
});
