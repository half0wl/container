# Dependency Injection

## @Inject Decorator

Use `@Inject()` to declare dependencies between services:

```ts
@Service()
class OrderService extends BaseService<ContainerDeps> {
  @Inject(() => UserService)
  declare readonly userService: UserService;

  @Inject(() => PaymentService)
  declare readonly paymentService: PaymentService;

  async checkout(userId: string, amount: number) {
    const user = this.userService.findById(userId);
    await this.paymentService.charge(user, amount);
  }
}
```

## How It Works

`@Inject(() => ServiceClass)` defines a lazy getter on the class prototype:

1. **First access** — calls `this.registry.get(ServiceClass)` to resolve the dependency from the same container
2. **Subsequent accesses** — returns the cached instance (stored in a Symbol-keyed property)

Since the getter calls `this.registry.get()`, the resolved service is always the singleton from the same container. This is what makes test isolation work.

## Why a Factory Function?

The factory pattern `() => ServiceClass` (instead of passing `ServiceClass` directly) prevents circular import issues. Without it, two files that import each other's service classes would hit a `undefined` reference at decoration time:

```ts
// user.service.ts
import { AuthService } from './auth.service'; // might be undefined at decoration time

// Instead, the factory is called lazily at first access:
@Inject(() => AuthService) // AuthService is resolved when actually needed
declare readonly authService: AuthService;
```

## The `declare` Keyword

Use TypeScript's `declare` modifier on injected properties:

```ts
@Inject(() => UserService)
declare readonly userService: UserService;
```

`declare` tells TypeScript the property exists without emitting any initialization code, which would overwrite the getter that `@Inject` sets up.

## Circular Dependencies

`@Inject` supports circular dependencies between services since resolution is lazy:

```ts
@Service()
class ServiceA extends BaseService<ContainerDeps> {
  @Inject(() => ServiceB)
  declare readonly b: ServiceB;
}

@Service()
class ServiceB extends BaseService<ContainerDeps> {
  @Inject(() => ServiceA)
  declare readonly a: ServiceA;
}
```

Both services can reference each other — as long as you don't access the injected property during construction.
