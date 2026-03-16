import { BaseService, Container, Inject, Service } from "@half0wl/container";

interface DatabaseClient {
  users: {
    findUnique(query: { where: { id: string } }): User | undefined;
    create(data: { name: string; email: string }): User;
  };
}

interface Logger {
  info(msg: string): void;
  error(msg: string): void;
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface ContainerDeps {
  db: DatabaseClient;
  logger: Logger;
}

const users: User[] = [
  { id: "1", name: "Alice", email: "alice@example.com" },
  { id: "2", name: "Bob", email: "bob@example.com" },
];

const fakeDb: DatabaseClient = {
  users: {
    findUnique({ where }) {
      return users.find((u) => u.id === where.id);
    },
    create(data) {
      const user = { id: String(users.length + 1), ...data };
      users.push(user);
      return user;
    },
  },
};

const consoleLogger: Logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
};

@Service({ trace: true })
class UserService extends BaseService<ContainerDeps> {
  findById(id: string): User | undefined {
    this.deps.logger.info(`UserService.findById(${id})`);
    return this.deps.db.users.findUnique({ where: { id } });
  }

  create(name: string, email: string): User {
    this.deps.logger.info(`UserService.create(${name})`);
    return this.deps.db.users.create({ name, email });
  }
}

@Service({ trace: true })
class AuthService extends BaseService<ContainerDeps> {
  @Inject(() => UserService)
  declare readonly userService: UserService;

  authenticate(token: string): User | undefined {
    this.deps.logger.info(`AuthService.authenticate(${token})`);
    // In a real app, decode the token — here we just use it as an ID
    return this.userService.findById(token);
  }
}

// ---- Traced service demo ----

let traceDepth = 0;
function simpleTrace(spanName: string, fn: () => unknown): unknown {
  const indent = "  ".repeat(traceDepth + 1);
  console.log(`${indent}[TRACE] >> ${spanName}`);
  traceDepth++;
  const result = fn();
  traceDepth--;
  console.log(`${indent}[TRACE] << ${spanName}`);
  return result;
}

@Service({ trace: true })
class NotificationService extends BaseService<ContainerDeps> {
  @Inject(() => UserService)
  declare readonly userService: UserService;

  notifyUser(userId: string, message: string): void {
    const user = this.userService.findById(userId);
    if (user) {
      this.deps.logger.info(`Sending "${message}" to ${user.email}`);
    } else {
      this.deps.logger.error(`User ${userId} not found`);
    }
  }
}

function main() {
  console.log("=== @half0wl/container demo ===\n");

  // 1. Create a container with deps
  const container = Container.create<ContainerDeps>({
    deps: { db: fakeDb, logger: consoleLogger },
    trace: simpleTrace,
  });

  // 2. Get services — singletons are created lazily
  const auth = container.get(AuthService);
  const notifications = container.get(NotificationService);

  // 3. Use services
  console.log("--- Authenticate user '1' ---");
  const user = auth.authenticate("1");
  console.log("Result:", user);

  console.log("\n--- Send notification (with tracing) ---");
  notifications.notifyUser("2", "Hello from the DI demo!");

  console.log("\n--- Authenticate unknown user ---");
  const unknown = auth.authenticate("999");
  console.log("Result:", unknown);

  // 4. Demonstrate test isolation
  console.log("\n--- Test isolation demo ---");
  const testContainer = Container.create<ContainerDeps>({
    deps: { db: fakeDb, logger: consoleLogger },
    trace: simpleTrace,
  });
  const mockUserService = {
    findById: () => ({ id: "mock", name: "MockUser", email: "mock@test.com" }),
  };
  testContainer.register(
    UserService,
    mockUserService as unknown as UserService,
  );

  const testAuth = testContainer.get(AuthService);
  const mockResult = testAuth.authenticate("anything");
  console.log("Mock result:", mockResult);

  console.log("\n=== Done ===");
}

main();
