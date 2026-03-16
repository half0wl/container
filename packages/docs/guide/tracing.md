# Tracing

## Auto-Tracing with @Service({ trace: true })

Add `{ trace: true }` to the `@Service()` decorator to automatically wrap all methods with tracing spans:

```ts
@Service({ trace: true })
class UserService extends BaseService<ContainerDeps> {
  findById(id: string) {
    return this.deps.db.users.findUnique({ where: { id } });
  }

  create(name: string, email: string) {
    return this.deps.db.users.create({ data: { name, email } });
  }
}
```

Both `findById` and `create` will be traced as `UserService.findById` and `UserService.create`.

## Providing a Trace Function

Pass a `trace` function when creating the container:

```ts
const container = Container.create<ContainerDeps>({
  deps: { db, logger },
  trace: (spanName, fn) => {
    return tracer.startActiveSpan(spanName, (span) => {
      try {
        return fn();
      } finally {
        span.end();
      }
    });
  },
});
```

The `trace` function receives:
- `spanName` — in `ClassName.methodName` format
- `fn` — the original method call to execute

## What Gets Traced

- All methods defined on the class and its parent classes (up to `BaseService`)
- Inherited methods from intermediate classes in the prototype chain

## What Gets Skipped

- **Getters and setters** — skipped to avoid interfering with `@Inject`
- **The constructor** — not traced
- **Methods on `BaseService` itself** — only your code is traced

## Selective Tracing

Only services with `@Service({ trace: true })` are traced. Services with plain `@Service()` are left unwrapped, so you can choose which services need observability:

```ts
@Service({ trace: true })  // traced
class PaymentService extends BaseService<ContainerDeps> { ... }

@Service()                  // not traced
class HelperService extends BaseService<ContainerDeps> { ... }
```
