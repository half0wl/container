# 📦 container

[![github](https://img.shields.io/github/stars/half0wl/container?logo=github)](https://github.com/half0wl/container)
[![npm](https://img.shields.io/npm/v/@half0wl/container?logo=npm)](https://www.npmjs.com/package/@half0wl/container)
[![docs](https://img.shields.io/badge/%F0%9F%93%9A_docs-container.lib.ray.cat-blue)](https://container.lib.ray.cat)
[![ci](https://github.com/half0wl/container/actions/workflows/ci.yml/badge.svg)](https://github.com/half0wl/container/actions/workflows/ci.yml)

Lightweight decorator-based dependency injection container for TypeScript.

```bash
pnpm i @half0wl/container
```

```ts
import { Container, BaseService, Service, Inject } from "@half0wl/container";

interface ContainerDeps {
  db: DatabaseClient;
  logger: Logger;
}

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
    return this.userService.findById(tokenToId(token));
  }
}

const container = Container.create<ContainerDeps>({ db, logger });
const auth = container.get(AuthService);
```

Requires `"experimentalDecorators": true` in tsconfig.json.

## Documentation

Full guide and API reference at **[container.lib.ray.cat](https://container.lib.ray.cat)**.

- [Getting Started](https://container.lib.ray.cat/guide/getting-started)
- [Services](https://container.lib.ray.cat/guide/services)
- [Dependency Injection](https://container.lib.ray.cat/guide/injection)
- [Tracing](https://container.lib.ray.cat/guide/tracing)
- [Testing](https://container.lib.ray.cat/guide/testing)
- [API Reference](https://container.lib.ray.cat/api/)

## Development

```bash
# install dependencies
pnpm install

# build all packages
pnpm -r build

# run tests
pnpm -r test

# lint with biome
pnpm lint

# lint and auto-fix
pnpm lint:fix

# run documentation site locally
pnpm --filter docs dev

# build documentation for production
pnpm --filter docs build

# run the demo
pnpm --filter demo build && pnpm --filter demo start
```

## License

[MIT](./LICENSE)
