# Services

## Defining a Service

Every service extends `BaseService<TDeps>` and is decorated with `@Service()`:

```ts
interface ContainerDeps {
  db: DatabaseClient;
  logger: Logger;
}

@Service()
class UserService extends BaseService<ContainerDeps> {
  findById(id: string) {
    this.deps.logger.info(`Finding user ${id}`);
    return this.deps.db.users.findUnique({ where: { id } });
  }

  create(name: string, email: string) {
    return this.deps.db.users.create({ data: { name, email } });
  }
}
```

## What Services Receive

When the container constructs a service, it passes `{ ...yourDeps, registry: container }`. `BaseService` splits this into two protected fields:

| Field | Type | Description |
|-------|------|-------------|
| `this.deps` | `TDeps` | Your user-defined dependencies |
| `this.registry` | `IContainer` | The container (used by `@Inject` internally) |

## Generic Dependencies

The `TDeps` type parameter is completely user-defined. Different parts of your app can use different shapes:

```ts
interface WorkerDeps {
  queue: QueueClient;
  logger: Logger;
}

@Service()
class EmailWorker extends BaseService<WorkerDeps> {
  async process() {
    const job = await this.deps.queue.dequeue();
    // ...
  }
}
```

