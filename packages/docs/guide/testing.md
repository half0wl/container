# Testing

## Isolated Containers

Each `Container.create()` call returns an independent container. Services resolved from different containers are completely isolated:

```ts
const prodContainer = Container.create<ContainerDeps>({ db: realDb, logger: realLogger });
const testContainer = Container.create<ContainerDeps>({ db: mockDb, logger: mockLogger });

// These are different instances
prodContainer.get(UserService) !== testContainer.get(UserService);
```

## Mock Substitution

Use `container.register()` to substitute mock implementations:

```ts
it('authenticates with a valid token', () => {
  const container = Container.create<ContainerDeps>({ db: mockDb, logger: mockLogger });

  const mockUserService = {
    findById: vi.fn(() => ({ id: '1', name: 'Alice' })),
  };
  container.register(UserService, mockUserService as any);

  const auth = container.get(AuthService);
  const user = auth.authenticate('valid-token');

  expect(user.name).toBe('Alice');
  expect(mockUserService.findById).toHaveBeenCalled();
});
```

When `AuthService` accesses `this.userService` via `@Inject`, it resolves from the same test container — which returns your mock.

## Test Cleanup

### Per-Test Containers (Recommended)

Create a fresh container in each test:

```ts
let container: Container<ContainerDeps>;

beforeEach(() => {
  container = Container.create<ContainerDeps>({ db: mockDb, logger: mockLogger });
});
```

### Global Container Cleanup

If using the global container, reset it between tests:

```ts
afterEach(() => {
  Container.resetGlobal();
});
```

## Clearing Cached Instances

`container.clear()` removes all cached singletons. The next `get()` call constructs fresh instances:

```ts
const container = Container.create<ContainerDeps>(deps);
const first = container.get(UserService);
container.clear();
const second = container.get(UserService);
// first !== second
```

## Full Example

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container, BaseService, Service, Inject } from '@raychen/container';

interface TestDeps {
  db: { users: { findUnique: (q: any) => any } };
  logger: { info: (msg: string) => void };
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

describe('AuthService', () => {
  let container: Container<TestDeps>;

  beforeEach(() => {
    container = Container.create<TestDeps>({
      db: { users: { findUnique: vi.fn() } },
      logger: { info: vi.fn() },
    });
  });

  it('uses real UserService by default', () => {
    const auth = container.get(AuthService);
    auth.authenticate('user-1');
    expect(container.get(UserService)).toBeInstanceOf(UserService);
  });

  it('uses mock UserService when registered', () => {
    const mock = { findById: vi.fn(() => ({ id: '1', name: 'Mock' })) };
    container.register(UserService, mock as any);

    const auth = container.get(AuthService);
    expect(auth.authenticate('token')).toEqual({ id: '1', name: 'Mock' });
  });
});
```
