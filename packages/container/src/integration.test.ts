import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseService, Container, Inject, Service } from "./index.js";

// --- Full app simulation ---

interface ContainerDeps {
  db: FakeDb;
  logger: FakeLogger;
}

interface FakeLogger {
  info: (msg: string) => void;
  error: (msg: string) => void;
  messages: string[];
}

interface FakeDb {
  users: Map<string, { id: string; name: string; email: string }>;
  orders: Map<string, { id: string; userId: string; total: number }>;
}

function createFakeLogger(): FakeLogger {
  const messages: string[] = [];
  return {
    info: (msg) => messages.push(`[INFO] ${msg}`),
    error: (msg) => messages.push(`[ERROR] ${msg}`),
    messages,
  };
}

function createFakeDb(): FakeDb {
  return {
    users: new Map([
      ["u1", { id: "u1", name: "Alice", email: "alice@test.com" }],
      ["u2", { id: "u2", name: "Bob", email: "bob@test.com" }],
    ]),
    orders: new Map([
      ["o1", { id: "o1", userId: "u1", total: 100 }],
      ["o2", { id: "o2", userId: "u1", total: 200 }],
      ["o3", { id: "o3", userId: "u2", total: 50 }],
    ]),
  };
}

// --- Service layer ---

@Service()
class UserService extends BaseService<ContainerDeps> {
  findById(id: string) {
    return this.deps.db.users.get(id) ?? null;
  }
  findAll() {
    return [...this.deps.db.users.values()];
  }
}

@Service()
class OrderService extends BaseService<ContainerDeps> {
  @Inject(() => UserService)
  declare readonly userService: UserService;

  findByUserId(userId: string) {
    return [...this.deps.db.orders.values()].filter((o) => o.userId === userId);
  }

  getUserOrderSummary(userId: string) {
    const user = this.userService.findById(userId);
    if (!user) return null;
    const orders = this.findByUserId(userId);
    const total = orders.reduce((sum, o) => sum + o.total, 0);
    return { user: user.name, orderCount: orders.length, total };
  }
}

@Service()
class NotificationService extends BaseService<ContainerDeps> {
  @Inject(() => UserService)
  declare readonly userService: UserService;

  notify(userId: string, message: string) {
    const user = this.userService.findById(userId);
    if (user) {
      this.deps.logger.info(`Notify ${user.email}: ${message}`);
      return true;
    }
    this.deps.logger.error(`User ${userId} not found`);
    return false;
  }
}

@Service({ trace: true })
class CheckoutService extends BaseService<ContainerDeps> {
  @Inject(() => OrderService)
  declare readonly orderService: OrderService;

  @Inject(() => NotificationService)
  declare readonly notificationService: NotificationService;

  checkout(userId: string, amount: number) {
    const orderId = `o${Date.now()}`;
    this.deps.db.orders.set(orderId, { id: orderId, userId, total: amount });
    this.deps.logger.info(`Order ${orderId} created for ${amount}`);
    this.notificationService.notify(userId, `Order ${orderId} confirmed`);
    return orderId;
  }
}

// --- Integration tests ---

describe("Integration: multi-service app", () => {
  let container: Container<ContainerDeps>;
  let db: FakeDb;
  let logger: FakeLogger;

  beforeEach(() => {
    Container.resetGlobal();
    db = createFakeDb();
    logger = createFakeLogger();
    container = Container.create<ContainerDeps>({
      deps: { db, logger },
      trace: (_name, fn) => fn(),
    });
  });

  it("services share the same deps (db, logger)", () => {
    const users = container.get(UserService);
    const orders = container.get(OrderService);
    // Both should see the same db
    expect(users.findById("u1")).toEqual(orders.userService.findById("u1"));
  });

  it("@Inject resolves to container singletons", () => {
    const orders = container.get(OrderService);
    const directUsers = container.get(UserService);
    expect(orders.userService).toBe(directUsers);
  });

  it("deep @Inject chains work (CheckoutService -> OrderService -> UserService)", () => {
    const checkout = container.get(CheckoutService);
    const summary = checkout.orderService.getUserOrderSummary("u1");
    expect(summary).toEqual({ user: "Alice", orderCount: 2, total: 300 });
  });

  it("full checkout flow with notifications", () => {
    const checkout = container.get(CheckoutService);
    const orderId = checkout.checkout("u1", 500);
    expect(orderId).toBeDefined();
    expect(db.orders.get(orderId)).toEqual({
      id: orderId,
      userId: "u1",
      total: 500,
    });
    expect(logger.messages).toContainEqual(expect.stringContaining("Order"));
    expect(logger.messages).toContainEqual(
      expect.stringContaining("alice@test.com"),
    );
  });

  it("notification fails gracefully for unknown user", () => {
    const notif = container.get(NotificationService);
    const result = notif.notify("unknown", "hello");
    expect(result).toBe(false);
    expect(logger.messages).toContainEqual(
      expect.stringContaining("not found"),
    );
  });
});

describe("Integration: test isolation with mocks", () => {
  beforeEach(() => {
    Container.resetGlobal();
  });

  it("mock UserService propagates through @Inject chain", () => {
    const mockUser = {
      findById: vi.fn((id: string) => ({
        id,
        name: "MockUser",
        email: "mock@test.com",
      })),
      findAll: vi.fn(() => []),
    };

    const container = Container.create<ContainerDeps>({
      db: createFakeDb(),
      logger: createFakeLogger(),
    });
    container.register(UserService, mockUser as unknown as UserService);

    const orders = container.get(OrderService);
    const summary = orders.getUserOrderSummary("u1");
    expect(summary?.user).toBe("MockUser");
    expect(mockUser.findById).toHaveBeenCalledWith("u1");
  });

  it("two test containers are fully independent", () => {
    const c1 = Container.create<ContainerDeps>({
      db: createFakeDb(),
      logger: createFakeLogger(),
    });
    const c2 = Container.create<ContainerDeps>({
      db: createFakeDb(),
      logger: createFakeLogger(),
    });

    const mockUser = { findById: () => ({ id: "x", name: "Mock", email: "" }) };
    c2.register(UserService, mockUser as unknown as UserService);

    const orders1 = c1.get(OrderService);
    const orders2 = c2.get(OrderService);

    // c1 uses real UserService
    expect(orders1.userService).toBeInstanceOf(UserService);
    // c2 uses mock
    expect(orders2.userService).toBe(mockUser);
  });

  it("register after get replaces for future .get() calls", () => {
    const container = Container.create<ContainerDeps>({
      db: createFakeDb(),
      logger: createFakeLogger(),
    });
    const real = container.get(UserService);
    expect(real).toBeInstanceOf(UserService);

    const mock = { findById: vi.fn() } as unknown as UserService;
    container.register(UserService, mock);
    expect(container.get(UserService)).toBe(mock);
  });

  it("clear + re-get creates fresh instances", () => {
    const container = Container.create<ContainerDeps>({
      db: createFakeDb(),
      logger: createFakeLogger(),
    });
    const first = container.get(OrderService);
    const firstUser = first.userService;

    container.clear();

    const second = container.get(OrderService);
    expect(second).not.toBe(first);
    // @Inject on the new OrderService should get a new UserService
    expect(second.userService).not.toBe(firstUser);
  });
});

describe("Integration: tracing across service boundaries", () => {
  const spans: string[] = [];

  beforeEach(() => {
    Container.resetGlobal();
    spans.length = 0;
  });

  it("traces CheckoutService methods but not injected services", () => {
    const trace = (name: string, fn: () => unknown) => {
      spans.push(name);
      return fn();
    };
    const container = Container.create<ContainerDeps>({
      deps: { db: createFakeDb(), logger: createFakeLogger() },
      trace,
    });

    const checkout = container.get(CheckoutService);
    checkout.checkout("u1", 42);

    expect(spans).toContain("CheckoutService.checkout");
    // UserService and OrderService are NOT traced (no { trace: true })
    expect(spans.every((s) => s.startsWith("CheckoutService."))).toBe(true);
  });
});

describe("Integration: global container lazy init pattern", () => {
  beforeEach(() => {
    Container.resetGlobal();
  });

  it("global container can be configured lazily then used", () => {
    // Simulate module-level code that grabs the global before deps exist
    const global = Container.getGlobalInstance<ContainerDeps>();

    // Later, at app startup
    global.setDeps({ db: createFakeDb(), logger: createFakeLogger() });

    // Now services resolve fine
    const users = global.get(UserService);
    expect(users.findById("u1")?.name).toBe("Alice");
  });

  it("global container throws if used before setDeps", () => {
    const global = Container.getGlobalInstance<ContainerDeps>();
    expect(() => global.get(UserService)).toThrow("Container deps not set");
  });
});
