# Getting Started

## Installation

Lightweight decorator-based dependency injection container for TypeScript.

```bash
pnpm i @half0wl/container
```

## TypeScript Configuration

`@half0wl/container` uses legacy TypeScript decorators. Add this to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

## Quick Example

```ts
import { Container, BaseService, Service, Inject } from "@half0wl/container";

// 1. Define your dependency shape
interface ContainerDeps {
  db: DatabaseClient;
  logger: Logger;
}

// 2. Create services
@Service()
class UserService extends BaseService<ContainerDeps> {
  findById(id: string) {
    return this.deps.db.users.findUnique({ where: { id } });
  }
}

@Service()
class AuthService extends BaseService<ContainerDeps> {
  @Inject(() => UserService)
  declare readonly userService: UserService;

  authenticate(token: string) {
    const userId = decodeToken(token);
    return this.userService.findById(userId);
  }
}

// 3. Create a container and resolve services
const container = Container.create<ContainerDeps>({ db, logger });
const auth = container.get(AuthService);
```

## How It Works

1. **Define a deps interface** — this is the set of infrastructure dependencies your services need (database, logger, cache, etc.).
2. **Extend `BaseService<TDeps>`** — your services receive `this.deps` (your infrastructure) and `this.registry` (the container).
3. **Use `@Inject()`** — declare inter-service dependencies as properties. They resolve lazily from the same container.
4. **Call `container.get()`** — the container constructs, caches, and returns singleton instances.
