# Usage Examples

## 1. Basic Usage with URI (Simplest)

```typescript
import Keyv from "keyv";
import { KeyvMongodbStore } from "keyv-mongodb-store";

const store = new KeyvMongodbStore("mongodb://localhost:27017/myapp");
const keyv = new Keyv({ store });

await keyv.set("user:123", { name: "Alice", email: "alice@example.com" });
const user = await keyv.get("user:123");
console.log(user); // { name: "Alice", email: "alice@example.com" }

// Close when done
await store.close();
```

## 2. URI with Custom Options

```typescript
const store = new KeyvMongodbStore("mongodb://localhost:27017/myapp", {
  collectionName: "sessions",
  namespace: "prod",
  mongoClientOptions: {
    maxPoolSize: 10,
    minPoolSize: 2,
  }
});
```

## 3. Using Existing Database Instance

```typescript
import { MongoClient } from "mongodb";
import { KeyvMongodbStore } from "keyv-mongodb-store";

const client = new MongoClient("mongodb://localhost:27017");
await client.connect();
const db = client.db("myapp");

const store = new KeyvMongodbStore(db, { collectionName: "cache" });
const keyv = new Keyv({ store });

// You manage the client connection lifecycle
await client.close();
```

## 4. Using Existing Collection Instance

```typescript
import { MongoClient } from "mongodb";
import { KeyvMongodbStore } from "keyv-mongodb-store";

const client = new MongoClient("mongodb://localhost:27017");
await client.connect();
const db = client.db("myapp");
const collection = db.collection("my-keyv-store");

// Pass the collection directly
const store = new KeyvMongodbStore(collection);
const keyv = new Keyv({ store });
```

## 5. With Namespace for Multi-Tenant Applications

```typescript
// Tenant 1
const store1 = new KeyvMongodbStore("mongodb://localhost:27017/saas", {
  namespace: "tenant-001"
});
const keyv1 = new Keyv({ store: store1 });

// Tenant 2
const store2 = new KeyvMongodbStore("mongodb://localhost:27017/saas", {
  namespace: "tenant-002"
});
const keyv2 = new Keyv({ store: store2 });

await keyv1.set("config", { theme: "dark" });
await keyv2.set("config", { theme: "light" });

console.log(await keyv1.get("config")); // { theme: "dark" }
console.log(await keyv2.get("config")); // { theme: "light" }
```

## 6. With TTL for Session Management

```typescript
const store = new KeyvMongodbStore("mongodb://localhost:27017/myapp");
const sessions = new Keyv({ store });

// Session expires in 1 hour (3600000 milliseconds)
await sessions.set("session:abc123", {
  userId: "user-456",
  createdAt: Date.now()
}, 3600000);

// After 1 hour, the session will be automatically removed
```

## 7. With Custom Serialization

```typescript
const store = new KeyvMongodbStore("mongodb://localhost:27017/myapp", {
  serializer: {
    stringify: JSON.stringify,
    parse: JSON.parse
  }
});

const keyv = new Keyv({ store });
await keyv.set("complex", { nested: { data: [1, 2, 3] } });
```

## 8. Multiple Stores in One Application

```typescript
// Cache store
const cacheStore = new KeyvMongodbStore("mongodb://localhost:27017/myapp", {
  collectionName: "cache"
});
const cache = new Keyv({ store: cacheStore });

// Session store
const sessionStore = new KeyvMongodbStore("mongodb://localhost:27017/myapp", {
  collectionName: "sessions"
});
const sessions = new Keyv({ store: sessionStore });

// User preferences store
const prefsStore = new KeyvMongodbStore("mongodb://localhost:27017/myapp", {
  collectionName: "preferences"
});
const prefs = new Keyv({ store: prefsStore });
```

## 9. Production Configuration

```typescript
const store = new KeyvMongodbStore(process.env.MONGODB_URI!, {
  collectionName: "keyv",
  namespace: process.env.NODE_ENV,
  mongoClientOptions: {
    maxPoolSize: 50,
    minPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4
  }
});

const keyv = new Keyv({ store });

// Graceful shutdown
process.on("SIGTERM", async () => {
  await store.close();
  process.exit(0);
});
```

## 10. Testing with Different Environments

```typescript
// Test environment
if (process.env.NODE_ENV === "test") {
  const testStore = new KeyvMongodbStore("mongodb://localhost:27017/test-db", {
    namespace: "test"
  });
  const keyv = new Keyv({ store: testStore });

  // Your tests

  await testStore.close();
}

// Production environment
if (process.env.NODE_ENV === "production") {
  const prodStore = new KeyvMongodbStore(process.env.MONGODB_URI!, {
    collectionName: "production-cache",
    namespace: "prod"
  });
  const keyv = new Keyv({ store: prodStore });
}
```

## 11. Multiple Namespaces on Same Collection

This is particularly useful for multi-tenant applications where you want to share infrastructure while maintaining data isolation:

```typescript
import { MongoClient } from "mongodb";
import { KeyvMongodbStore } from "keyv-mongodb-store";
import Keyv from "keyv";

const client = new MongoClient("mongodb://localhost:27017");
await client.connect();
const db = client.db("myapp");

// Single collection shared across multiple tenants
const collection = db.collection("shared-keyv-store");

// Create separate stores for each tenant using the same collection
const tenant1Store = new KeyvMongodbStore(collection, { namespace: "tenant-001" });
const tenant2Store = new KeyvMongodbStore(collection, { namespace: "tenant-002" });
const tenant3Store = new KeyvMongodbStore(collection, { namespace: "tenant-003" });

const tenant1 = new Keyv({ store: tenant1Store });
const tenant2 = new Keyv({ store: tenant2Store });
const tenant3 = new Keyv({ store: tenant3Store });

// Each tenant can use the same keys without conflicts
await tenant1.set("config", { theme: "dark", companyName: "Acme Corp" });
await tenant2.set("config", { theme: "light", companyName: "TechStart" });
await tenant3.set("config", { theme: "blue", companyName: "Global Ltd" });

console.log(await tenant1.get("config")); // { theme: "dark", companyName: "Acme Corp" }
console.log(await tenant2.get("config")); // { theme: "light", companyName: "TechStart" }
console.log(await tenant3.get("config")); // { theme: "blue", companyName: "Global Ltd" }

// Clear operation only affects the specific namespace
await tenant2.clear(); // Only clears tenant-002 data
console.log(await tenant1.get("config")); // Still exists
console.log(await tenant2.get("config")); // undefined
console.log(await tenant3.get("config")); // Still exists
```

### Benefits of Using Namespaces on Same Collection:

1. **Resource Efficiency**: Single collection means fewer indexes and less memory overhead
2. **Data Isolation**: Each namespace is completely isolated despite sharing storage
3. **Simplified Management**: One collection to backup, monitor, and maintain
4. **Cost Effective**: Particularly useful in cloud environments with per-collection pricing
5. **Flexible TTL**: Each namespace can have different expiration policies on the same keys
